// 📚 Media library -- the app's only link to Dropbox. READ-ONLY: it lists, indexes and
// fetches previews; it never changes, moves or deletes anything in Dropbox.
// Admins only (checked on every call). The Dropbox refresh token lives in public.dropbox_auth,
// which only this server code can read (RLS on, no policies).
//
// POST { action } with the admin's session:
//   status            -> { connected, account }
//   connect           -> { url }  (open it, approve, Dropbox sends you back via dropbox-callback)
//   disconnect
//   folders  {path}   -> subfolders, for choosing what to include
//   sync              -> indexes included folders for ~8 seconds; { more } says call again
//   thumbs   {paths}  -> small previews (up to 25), as data URLs
//   image    {path}   -> large version (2048px) for the graphic maker, as a data URL
//   link     {path}   -> 4-hour link to play / download the original (videos)
const API = 'https://api.dropboxapi.com/2'
const CONTENT = 'https://content.dropboxapi.com/2'
const PHOTO = /\.(jpe?g|png|heic|heif|webp|gif|tiff?)$/i
const VIDEO = /\.(mp4|mov|m4v|avi|mkv|3gp|wmv)$/i

const env = () => ({
  url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  anon: process.env.VITE_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  key: process.env.DROPBOX_APP_KEY,
  secret: process.env.DROPBOX_APP_SECRET,
  site: process.env.URL || 'https://klasschamp.netlify.app',
})
const redirectUri = () => `${env().site}/.netlify/functions/dropbox-callback`

async function db(path, opts = {}) {
  const e = env()
  const r = await fetch(`${e.url}/rest/v1/${path}`, { ...opts, headers: { apikey: e.service, Authorization: `Bearer ${e.service}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  if (!r.ok) throw new Error(`database ${path.split('?')[0]}: ${r.status} ${await r.text()}`)
  return r.status === 204 || r.headers.get('content-length') === '0' ? null : r.json().catch(() => null)
}
const getAuth = async () => (await db('dropbox_auth?id=eq.1&select=*'))?.[0] || null
const saveAuth = patch => db('dropbox_auth?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: 1, ...patch }) })

// header values must be plain ASCII -- escape anything else (accents etc. in folder names)
const asciiJson = o => JSON.stringify(o).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))

async function client() {
  const e = env(), auth = await getAuth()
  if (!auth?.refresh_token) throw Object.assign(new Error('Dropbox is not connected'), { code: 409 })
  const t = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refresh_token, client_id: e.key, client_secret: e.secret }),
  })
  const tj = await t.json()
  if (!t.ok) throw new Error('Dropbox sign-in expired -- press Connect Dropbox again (' + (tj.error_description || tj.error) + ')')
  const base = { Authorization: `Bearer ${tj.access_token}`, ...(auth.root_namespace_id ? { 'Dropbox-API-Path-Root': asciiJson({ '.tag': 'root', root: auth.root_namespace_id }) } : {}) }
  return {
    async rpc(endpoint, body) {
      const r = await fetch(`${API}/${endpoint}`, { method: 'POST', headers: { ...base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(`Dropbox ${endpoint}: ${j.error_summary || r.status}`)
      return j
    },
    async contentJson(endpoint, body) {
      const r = await fetch(`${CONTENT}/${endpoint}`, { method: 'POST', headers: { ...base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(`Dropbox ${endpoint}: ${j.error_summary || r.status}`)
      return j
    },
    async download(endpoint, arg) {
      const r = await fetch(`${CONTENT}/${endpoint}`, { method: 'POST', headers: { ...base, 'Dropbox-API-Arg': asciiJson(arg) } })
      if (!r.ok) throw new Error(`Dropbox ${endpoint}: ${r.status} ${(await r.text()).slice(0, 200)}`)
      return Buffer.from(await r.arrayBuffer())
    },
  }
}

function takenAt(f) {
  const t = f.media_info?.metadata?.time_taken
  if (t) return t
  const m = f.name.match(/(20\d{2}|19\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}T12:00:00Z`
  return f.client_modified || null
}

// Index included folders until the time budget runs out. Safe to call over and over:
// the first pass walks everything, later calls only pick up what changed in Dropbox.
async function runSync(budgetMs = 8000) {
  const started = Date.now()
  const dbx = await client()
  const folders = (await db('media_folders?included=eq.true&select=*&order=done.asc,last_synced.asc.nullsfirst')) || []
  // subfolders marked "Leave out" inside an included folder are never indexed
  const leftOut = ((await db('media_folders?included=eq.false&select=path')) || []).map(f => f.path.toLowerCase() + '/')
  const isLeftOut = p => leftOut.some(x => (String(p).toLowerCase() + '/').startsWith(x))
  let added = 0, more = false
  for (const folder of folders) {
    if (Date.now() - started > budgetMs) { more = true; break }
    let cursor = folder.cursor, hasMore = true, count = 0, finished = folder.done
    while (hasMore && Date.now() - started < budgetMs) {
      const page = cursor
        ? await dbx.rpc('files/list_folder/continue', { cursor })
        : await dbx.rpc('files/list_folder', { path: folder.path, recursive: true, include_media_info: true, limit: 2000 })
            .catch(() => dbx.rpc('files/list_folder', { path: folder.path, recursive: true, limit: 2000 }))   // in case Dropbox drops the old media-info option
      const rows = [], gone = []
      for (const en of page.entries) {
        if (en['.tag'] === 'deleted') { gone.push(en.path_lower); continue }
        if (en['.tag'] !== 'file') continue
        if (isLeftOut(en.path_display)) continue
        const kind = PHOTO.test(en.name) ? 'photo' : VIDEO.test(en.name) ? 'video' : null
        if (!kind) continue
        rows.push({ dropbox_id: en.id, path: en.path_display, name: en.name, folder_path: folder.path, kind, taken_at: takenAt(en), size: en.size || null, missing: false })
      }
      for (let i = 0; i < rows.length; i += 500) {
        await db('media_items?on_conflict=dropbox_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) })
      }
      for (const p of gone.slice(0, 200)) {
        await db(`media_items?path=ilike.${encodeURIComponent(p.replace(/[*%]/g, ''))}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ missing: true }) })
      }
      count += rows.length; added += rows.length
      cursor = page.cursor; hasMore = page.has_more
      if (!hasMore) finished = true
      // save progress after every page, so a timeout never loses work
      await db(`media_folders?id=eq.${folder.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ cursor, done: finished, file_count: (folder.file_count || 0) + count, last_synced: new Date().toISOString() }) })
    }
    if (hasMore) more = true
  }
  return { added, more }
}

async function isAdmin(event) {
  const e = env()
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) return false
  const u = await fetch(`${e.url}/auth/v1/user`, { headers: { apikey: e.anon, Authorization: authHeader } })
  if (!u.ok) return false
  const user = await u.json()
  const rows = await db(`members?auth_id=eq.${user.id}&select=role`)
  return rows?.some(r => r.role === 'admin')
}
const json = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const e = env()
  if (!e.key || !e.secret) return json(500, { error: 'DROPBOX_APP_KEY / DROPBOX_APP_SECRET are not set in Netlify yet' })
  try {
    if (!(await isAdmin(event))) return json(403, { error: 'Admins only' })
    const body = JSON.parse(event.body || '{}')
    switch (body.action) {
      case 'status': {
        const a = await getAuth()
        return json(200, { connected: !!a?.refresh_token, account: a?.account_name || null })
      }
      case 'connect': {
        const state = require('crypto').randomBytes(16).toString('hex')
        await saveAuth({ pending_state: state })
        const q = new URLSearchParams({ client_id: e.key, response_type: 'code', token_access_type: 'offline', redirect_uri: redirectUri(), state })
        return json(200, { url: `https://www.dropbox.com/oauth2/authorize?${q}` })
      }
      case 'disconnect':
        await saveAuth({ refresh_token: null, account_name: null, root_namespace_id: null, connected_at: null })
        return json(200, { ok: true })
      case 'folders': {
        const dbx = await client()
        let page = await dbx.rpc('files/list_folder', { path: body.path || '', limit: 2000 })
        const out = [...page.entries]
        for (let i = 0; page.has_more && i < 5; i++) { page = await dbx.rpc('files/list_folder/continue', { cursor: page.cursor }); out.push(...page.entries) }
        return json(200, { folders: out.filter(x => x['.tag'] === 'folder').map(x => ({ name: x.name, path: x.path_display })).sort((a, b) => a.name.localeCompare(b.name)) })
      }
      case 'sync':
        return json(200, await runSync(8000))
      case 'thumbs': {
        const paths = (body.paths || []).slice(0, 25)
        if (!paths.length) return json(200, { thumbs: {} })
        const dbx = await client()
        const r = await dbx.contentJson('files/get_thumbnail_batch', { entries: paths.map(p => ({ path: p, format: 'jpeg', size: 'w256h256', mode: 'fitone_bestfit' })) })
        const thumbs = {}
        r.entries.forEach((en, i) => { if (en['.tag'] === 'success') thumbs[paths[i]] = 'data:image/jpeg;base64,' + en.thumbnail })
        return json(200, { thumbs })
      }
      case 'image': {
        const dbx = await client()
        const buf = await dbx.download('files/get_thumbnail_v2', { resource: { '.tag': 'path', path: body.path }, format: 'jpeg', size: 'w2048h1536', mode: 'fitone_bestfit' })
        return json(200, { dataUrl: 'data:image/jpeg;base64,' + buf.toString('base64') })
      }
      case 'link': {
        const dbx = await client()
        const r = await dbx.rpc('files/get_temporary_link', { path: body.path })
        return json(200, { url: r.link })
      }
      default:
        return json(400, { error: 'Unknown action' })
    }
  } catch (err) {
    console.error('dropbox-api:', err.message)
    return json(err.code || 500, { error: err.message })
  }
}

exports.runSync = runSync
exports.saveAuth = saveAuth
exports.getAuth = getAuth
exports.redirectUri = redirectUri
exports.env = env
