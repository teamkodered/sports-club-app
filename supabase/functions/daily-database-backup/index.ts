// Runs once a day via pg_cron. Dumps every row from the app's
// critical tables into a single dated JSON file in R2 -- a genuine
// safety net independent of whatever backup plan Supabase itself
// provides, so an accidental delete (like the one that prompted
// building this) can always be recovered from, regardless of plan.
//
// Reuses the same R2 credentials already set up for CCTV storage, but
// writes into a "database-backups/" folder within that same bucket
// rather than needing a whole separate bucket.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { AwsClient } from 'npm:aws4fetch@1'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!
const R2_BUCKET = Deno.env.get('R2_BUCKET')!
const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
  service: 's3',
  region: 'auto',
})

// The tables that matter most -- member/student records, attendance
// and points history, and anything else that would be genuinely
// painful or impossible to reconstruct by hand if lost. Add to this
// list as new important tables get created.
const TABLES_TO_BACKUP = [
  'members', 'students', 'membership_forms',
  'attendance', 'points_log', 'houses',
  'classes', 'student_class_assignments',
  'fit2fight_sessions', 'athlete_profiles', 'athlete_notes_log',
  'cctv_clips', 'cctv_clip_athletes',
  'enquiries', 'reminder_rules', 'reminder_sent_log',
  'courses', 'notice_sends', 'course_interest',
  'grading_expressions', 'team_targets', 'team_settings', 'settings',
]

Deno.serve(async () => {
  try {
    const backup: Record<string, unknown> = { taken_at: new Date().toISOString(), tables: {} }
    const errors: Record<string, string> = {}

    for (const table of TABLES_TO_BACKUP) {
      const { data, error } = await supabase.from(table).select('*')
      if (error) { errors[table] = error.message; continue }
      ;(backup.tables as Record<string, unknown>)[table] = data
    }
    if (Object.keys(errors).length) backup.errors = errors

    const dateStr = new Date().toISOString().split('T')[0]
    const key = `database-backups/${dateStr}.json`
    const body = JSON.stringify(backup)

    const objectUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`
    const signed = await r2.sign(objectUrl, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'application/json' },
      aws: { signQuery: true },
    })
    const uploadRes = await fetch(signed.url, { method: 'PUT', body, headers: { 'Content-Type': 'application/json' } })
    if (!uploadRes.ok) {
      return new Response(JSON.stringify({ error: `R2 upload failed: ${uploadRes.status} ${await uploadRes.text()}` }), { status: 500 })
    }

    return new Response(JSON.stringify({
      success: true,
      key,
      tables_backed_up: Object.keys(backup.tables as object).length,
      row_counts: Object.fromEntries(Object.entries(backup.tables as Record<string, unknown[]>).map(([t, rows]) => [t, rows.length])),
      errors: backup.errors || null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
