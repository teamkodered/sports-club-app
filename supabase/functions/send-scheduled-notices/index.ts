// Runs every 15 minutes via pg_cron. Finds every notice_sends row
// that's due (send_at <= now, status='pending'), emails everyone on
// its recipient list, then either marks it 'sent' (one-off) or rolls
// send_at forward to the next occurrence (weekly/monthly repeats).

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const NETLIFY_SITE_URL = 'https://klasschamp.netlify.app'
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

function nextOccurrence(sendAt: Date, interval: string): Date {
  const next = new Date(sendAt)
  if (interval === 'weekly') next.setDate(next.getDate() + 7)
  else if (interval === 'monthly') next.setMonth(next.getMonth() + 1)
  return next
}

Deno.serve(async () => {
  try {
    const now = new Date().toISOString()
    const { data: due, error } = await supabase.from('notice_sends').select('*').eq('status', 'pending').lte('send_at', now)
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    if (!due || due.length === 0) return new Response(JSON.stringify({ checked: 0, sent: 0 }), { status: 200 })

    let totalSent = 0

    for (const job of due) {
      const { data: members } = await supabase
        .from('students')
        .select('id, member_id, members(first_name, email)')
        .in('id', job.student_ids)

      for (const s of members || []) {
        const email = s.members?.email
        if (!email || email.includes('@kr-centre.placeholder')) continue
        const text = job.message_text.replace(/\{name\}/gi, s.members?.first_name || '')
        await fetch(`${NETLIFY_SITE_URL}/.netlify/functions/send-scheduled-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
          body: JSON.stringify({ to: email, subject: job.subject || 'Message from KR Centre', text }),
        })
        totalSent++
      }

      if (job.repeat_interval === 'none') {
        await supabase.from('notice_sends').update({ status: 'sent', last_sent_at: now }).eq('id', job.id)
      } else {
        const next = nextOccurrence(new Date(job.send_at), job.repeat_interval)
        await supabase.from('notice_sends').update({ send_at: next.toISOString(), last_sent_at: now }).eq('id', job.id)
      }
    }

    return new Response(JSON.stringify({ checked: due.length, sent: totalSent }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
