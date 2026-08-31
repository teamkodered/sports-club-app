// Generates a short-lived signed URL for playing back (or downloading)
// one CCTV clip stored in the private Cloudflare R2 bucket. The
// bucket is deliberately not public, so the app can't just link
// straight to a clip's storage_path -- it has to ask this function
// for a temporary, signed link each time someone opens a clip.
//
// R2 is S3-compatible, so this uses aws4fetch (a small AWS SigV4
// signing library) rather than the full AWS SDK, which is overkill
// for just needing signed GET URLs.
//
// Expects: { storage_path: string, download?: boolean }
// storage_path is the value straight from the cctv_clips table's
// storage_path column (e.g. "Camera_01/2026-08-27T13-25-51Z.mp4").
//
// Relies on these being set via `npx supabase secrets set`:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

import { AwsClient } from 'npm:aws4fetch@1'
import { createClient } from 'npm:@supabase/supabase-js@2'

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    // Only signed-in users get a URL -- this function is reachable
    // from the internet, so we don't want to hand out clip links to
    // anyone who just knows a storage_path.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })
    const { data: userData, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })

    const { storage_path, download, debug } = await req.json()
    if (!storage_path) return new Response(JSON.stringify({ error: 'storage_path is required' }), { status: 400, headers: corsHeaders })

    // Confirm this path actually belongs to a real, catalogued clip
    // (rather than signing a URL for an arbitrary path someone made
    // up) -- RLS on cctv_clips means this only succeeds if the
    // calling user is actually allowed to see this clip.
    const { data: clip } = await supabase.from('cctv_clips').select('storage_path, allow_download').eq('storage_path', storage_path).single()
    if (!clip) return new Response(JSON.stringify({ error: 'Clip not found or not accessible' }), { status: 404, headers: corsHeaders })
    if (download && !clip.allow_download) return new Response(JSON.stringify({ error: 'Downloading this clip is not allowed' }), { status: 403, headers: corsHeaders })

    const objectUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${storage_path}`
    const expiresIn = 3600 // 1 hour -- long enough to watch a full ~1hr clip without it expiring mid-playback
    // X-Amz-Expires has to be part of the URL *before* signing (it's
    // included in what gets signed) -- adding it afterward would
    // invalidate the signature.
    const urlToSign = `${objectUrl}?X-Amz-Expires=${expiresIn}`
    const signed = await r2.sign(urlToSign, { aws: { signQuery: true } })
    const url = signed.url.toString()

    // Debug mode: rather than handing back a URL and hoping the
    // browser tells us what went wrong, fetch it here on the server
    // and report exactly what R2 said -- status code, headers, and
    // a safe text snippet of the body (R2 error responses are small
    // XML, so this is readable; real video data just won't decode as
    // text and shows as [binary]).
    if (debug) {
      const probe = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-2047' } })
      const buf = await probe.arrayBuffer()
      const isLikelyText = probe.headers.get('content-type')?.includes('xml') || probe.headers.get('content-type')?.includes('text')
      const bodySnippet = isLikelyText ? new TextDecoder().decode(buf) : `[binary, ${buf.byteLength} bytes received]`
      return new Response(JSON.stringify({
        signed_url_used: url,
        status: probe.status,
        statusText: probe.statusText,
        headers: Object.fromEntries(probe.headers.entries()),
        bodySnippet,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ url, expires_in: expiresIn }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
