// Generates presigned R2 URLs for fight footage -- both for
// uploading (coaches, admin/captain only) and for playback/download
// (anyone RLS on fight_footage says can see this specific record).
// Same signing approach as cctv-presigned-url (aws4fetch, since R2 is
// S3-compatible), reusing the same R2 bucket under a different
// folder prefix.
//
// Expects: { mode: 'upload' | 'read', footage_id?: string, file_name?: string }
// - mode 'upload': returns a presigned PUT url + the storage_path to
//   save on the fight_footage row afterward. Staff-only.
// - mode 'read': given a footage_id, confirms the caller can see it
//   (via RLS on fight_footage) and returns a presigned GET url.
//
// Relies on the same secrets already set for CCTV:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

import { AwsClient } from 'npm:aws4fetch@1'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!
const R2_BUCKET = Deno.env.get('R2_BUCKET')!
const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
  service: 's3',
  region: 'auto',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })

    // Identify the caller using their OWN token against the anon-key
    // client, not the service-role one -- getUser() needs the caller's
    // actual session context to resolve correctly.
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: authError } = await callerClient.auth.getUser()
    if (authError || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })

    const { mode, footage_id, file_name, clip_id, student_id, storage_path, title, file_size } = await req.json()

    // ── Test videos (Test session -> jump / punch measuring) ─────────────────
    // Athletes may upload THEIR OWN test videos; staff may upload for any athlete.
    // The footage row is created here (service role) so athletes need no table rights:
    // folder "<Name> — Tests", visible to that athlete only (plus staff), published.
    if (mode === 'test_upload' || mode === 'test_register') {
      const { data: caller } = await supabase.from('members').select('id, role').eq('auth_id', userData.user.id).single()
      const isStaff = caller?.role === 'admin' || caller?.role === 'captain' || caller?.role === 'head_coach'
      let sid = student_id
      if (!isStaff) {
        const { data: own } = await supabase.from('students').select('id').eq('member_id', caller?.id).limit(1).maybeSingle()
        if (!own) return new Response(JSON.stringify({ error: 'No athlete record for this account' }), { status: 403, headers: corsHeaders })
        if (sid && sid !== own.id) return new Response(JSON.stringify({ error: 'You can only upload your own test videos' }), { status: 403, headers: corsHeaders })
        sid = own.id
      }
      if (!sid) return new Response(JSON.stringify({ error: 'student_id is required' }), { status: 400, headers: corsHeaders })
      const prefix = `fight-footage/tests/${sid}/`

      if (mode === 'test_upload') {
        if (!file_name) return new Response(JSON.stringify({ error: 'file_name is required' }), { status: 400, headers: corsHeaders })
        const safeName = String(file_name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
        const storagePath = `${prefix}${Date.now()}-${safeName}`
        const objectUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${storagePath}`
        const signed = await r2.sign(objectUrl, { method: 'PUT', aws: { signQuery: true } })
        return new Response(JSON.stringify({ upload_url: signed.url.toString(), storage_path: storagePath }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // test_register: only paths issued for this athlete
      if (!storage_path || !String(storage_path).startsWith(prefix)) return new Response(JSON.stringify({ error: 'Invalid storage path' }), { status: 400, headers: corsHeaders })
      const { data: st } = await supabase.from('students').select('id, members(first_name, last_name)').eq('id', sid).single()
      const name = `${st?.members?.first_name || ''} ${st?.members?.last_name || ''}`.trim() || 'Athlete'
      const folderName = `${name} — Tests`
      let { data: folder } = await supabase.from('footage_folders').select('id').ilike('name', folderName).maybeSingle()
      if (!folder) { const r = await supabase.from('footage_folders').insert({ name: folderName }).select('id').single(); folder = r.data }
      const { data: row, error: insErr } = await supabase.from('fight_footage').insert({
        title: String(title || 'Test video').slice(0, 200), description: 'Test video', storage_path, file_size_bytes: file_size || null,
        access_mode: 'select_athletes', folder_id: folder?.id || null, tags: ['test'], published: true,
      }).select('id').single()
      if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: corsHeaders })
      await supabase.from('fight_footage_featured').insert({ footage_id: row.id, student_id: sid })
      await supabase.from('fight_footage_athletes').insert({ footage_id: row.id, student_id: sid })
      return new Response(JSON.stringify({ footage_id: row.id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (mode === 'upload') {
      const { data: caller } = await supabase.from('members').select('role').eq('auth_id', userData.user.id).single()
      const isStaff = caller?.role === 'admin' || caller?.role === 'captain'
      if (!isStaff) return new Response(JSON.stringify({ error: 'Only coaches/admins can upload footage' }), { status: 403, headers: corsHeaders })
      if (!file_name) return new Response(JSON.stringify({ error: 'file_name is required' }), { status: 400, headers: corsHeaders })

      const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `fight-footage/${Date.now()}-${safeName}`
      const objectUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${storagePath}`
      const signed = await r2.sign(objectUrl, { method: 'PUT', aws: { signQuery: true } })
      return new Response(JSON.stringify({ upload_url: signed.url.toString(), storage_path: storagePath }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (mode === 'read_clip') {
      if (!clip_id) return new Response(JSON.stringify({ error: 'clip_id is required' }), { status: 400, headers: corsHeaders })
      // RLS on fight_footage_clips means this only returns a row if
      // the caller can actually see the source footage it belongs to.
      const { data: clip } = await callerClient.from('fight_footage_clips').select('storage_path, status').eq('id', clip_id).single()
      if (!clip) return new Response(JSON.stringify({ error: 'Clip not found or not accessible' }), { status: 404, headers: corsHeaders })
      if (clip.status !== 'ready') return new Response(JSON.stringify({ error: `Clip is still ${clip.status}` }), { status: 409, headers: corsHeaders })

      const objectUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${clip.storage_path}`
      const expiresIn = 3600
      const urlToSign = `${objectUrl}?X-Amz-Expires=${expiresIn}&response-content-type=video%2Fmp4&response-content-disposition=inline`
      const signed = await r2.sign(urlToSign, { aws: { signQuery: true } })
      return new Response(JSON.stringify({ url: signed.url.toString() }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (mode === 'read') {
      if (!footage_id) return new Response(JSON.stringify({ error: 'footage_id is required' }), { status: 400, headers: corsHeaders })
      // RLS on fight_footage means this only returns a row if the
      // calling user is actually allowed to see it (staff, or tagged
      // as one of the athletes, or access_mode = 'all').
      const { data: footage } = await callerClient.from('fight_footage').select('storage_path').eq('id', footage_id).single()
      if (!footage) return new Response(JSON.stringify({ error: 'Footage not found or not accessible' }), { status: 404, headers: corsHeaders })

      const objectUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${footage.storage_path}`
      const expiresIn = 3600
      const urlToSign = `${objectUrl}?X-Amz-Expires=${expiresIn}&response-content-type=video%2Fmp4&response-content-disposition=inline`
      const signed = await r2.sign(urlToSign, { aws: { signQuery: true } })
      return new Response(JSON.stringify({ url: signed.url.toString() }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: "mode must be 'upload' or 'read'" }), { status: 400, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
