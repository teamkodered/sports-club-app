// Trims a real, separate video file out of a larger fight-footage
// video using ffmpeg (bundled via @ffmpeg-installer/ffmpeg, a static
// binary matching Netlify's Linux function runtime). This is
// genuinely new kind of infrastructure for this app -- the first
// server-side video *processing* step, as opposed to just moving
// video files around -- so it's worth watching closely once real
// clips start getting trimmed.
//
// Uses stream-copy (-c copy) rather than re-encoding: much faster
// (seconds, not minutes) since it just repackages the existing video
// data rather than recompressing it, which matters given Netlify's
// function execution time limit. The tradeoff is the cut point snaps
// to the nearest keyframe rather than being frame-exact -- usually a
// fraction of a second off at most, fine for this use case.
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_BUCKET = process.env.R2_BUCKET

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Missing session' }) }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const { clip_id, source_storage_path, start_seconds, end_seconds } = JSON.parse(event.body || '{}')
  if (!clip_id || !source_storage_path || start_seconds == null || end_seconds == null) {
    return { statusCode: 400, body: JSON.stringify({ error: 'clip_id, source_storage_path, start_seconds, end_seconds are all required' }) }
  }

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authHeader } })
    if (!userRes.ok) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
    const user = await userRes.json()

    const callerRes = await fetch(`${supabaseUrl}/rest/v1/members?auth_id=eq.${user.id}&select=role`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
    const callerRows = await callerRes.json()
    const isStaff = callerRows?.[0]?.role === 'admin' || callerRows?.[0]?.role === 'captain'
    if (!isStaff) return { statusCode: 403, body: JSON.stringify({ error: 'Only coaches/admins can save clips' }) }

    const client = r2Client()
    const signedSourceUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: source_storage_path }), { expiresIn: 900 })

    const outputPath = path.join(os.tmpdir(), `clip-${clip_id}.mp4`)
    const duration = Math.max(0.1, end_seconds - start_seconds)

    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        '-ss', String(start_seconds),
        '-i', signedSourceUrl,
        '-t', String(duration),
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y', outputPath,
      ], { timeout: 25000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr?.slice(-500) || err.message))
        else resolve()
      })
    })

    const clipStoragePath = `fight-footage/clips/${clip_id}.mp4`
    const fileBuffer = fs.readFileSync(outputPath)
    await client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: clipStoragePath, Body: fileBuffer, ContentType: 'video/mp4' }))
    fs.unlinkSync(outputPath)

    await fetch(`${supabaseUrl}/rest/v1/fight_footage_clips?id=eq.${clip_id}`, {
      method: 'PATCH',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready', storage_path: clipStoragePath }),
    })

    return { statusCode: 200, body: JSON.stringify({ success: true, storage_path: clipStoragePath }) }
  } catch (err) {
    await fetch(`${(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)}/rest/v1/fight_footage_clips?id=eq.${clip_id}`, {
      method: 'PATCH',
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed', error_message: err.message }),
    }).catch(() => {})
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
