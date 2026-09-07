// Generates presigned R2 URLs for photo/video attachments on an
// athlete's personal notes (athlete_notes_log) -- reuses the same R2
// bucket as View IT's fight footage, under its own folder prefix, and
// the same aws4fetch signing approach as fight-footage-url/index.ts.
//
// Expects: { mode: 'upload' | 'read', file_name?: string, storage_path?: string }
// - mode 'upload': any authenticated member can upload -- it's their
//   own personal note, ownership is enforced by which student_id the
//   note ends up saved against, not by this function.
// - mode 'read': given a storage_path, confirms the caller actually
//   owns the note it belongs to before returning a signed GET url.

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

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: authError } = await callerClient.auth.getUser()
    if (authError || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })

    const { mode, file_name, storage_path } = await req.json()

    if (mode === 'upload') {
      if (!file_name) return new Response(JSON.stringify({ error: 'file_name is required' }), { status: 400, headers: corsHeaders })
      const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const newPath = `athlete-notes/${userData.user.id}/${Date.now()}-${safeName}`
      const objectUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${newPath}`
      const signed = await r2.sign(objectUrl, { method: 'PUT', aws: { signQuery: true } })
      return new Response(JSON.stringify({ upload_url: signed.url.toString(), storage_path: newPath }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (mode === 'read') {
      if (!storage_path) return new Response(JSON.stringify({ error: 'storage_path is required' }), { status: 400, headers: corsHeaders })

      // Confirms the caller actually owns the note this media belongs
      // to (via their own member -> student link) before signing --
      // otherwise anyone with a guessed/leaked path could view it.
      const { data: member } = await supabase.from('members').select('id').eq('auth_id', userData.user.id).single()
      const { data: student } = member ? await supabase.from('students').select('id').eq('member_id', member.id).maybeSingle() : { data: null }
      const { data: note } = student
        ? await supabase.from('athlete_notes_log').select('id').eq('student_id', student.id).eq('media_storage_path', storage_path).maybeSingle()
        : { data: null }
      if (!note) return new Response(JSON.stringify({ error: 'Not found or not accessible' }), { status: 404, headers: corsHeaders })

      const objectUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${storage_path}`
      const expiresIn = 3600
      const urlToSign = `${objectUrl}?X-Amz-Expires=${expiresIn}`
      const signed = await r2.sign(urlToSign, { aws: { signQuery: true } })
      return new Response(JSON.stringify({ url: signed.url.toString() }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: "mode must be 'upload' or 'read'" }), { status: 400, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
