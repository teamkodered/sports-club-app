// Netlify function: events from the club's shared Google calendars (read-only).
// Each calendar's private "secret address in iCal format" is stored in google_calendar_feeds
// (admins only). This function fetches them server-side, so the addresses never reach the browser.
//
// GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD   -> { events: [...] }  (calendars the caller may see)
// POST { test_url }                     -> { ok, count, sample }  (admins: check an address works)
const ical = require('node-ical')

const json = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function fetchIcs(url) {
  // Google's iCal addresses are https; "webcal://" is the same address for calendar apps
  const u = String(url || '').trim().replace(/^webcal:\/\//i, 'https://')
  if (!/^https:\/\//i.test(u)) throw new Error('The address must start with https:// (or webcal://)')
  // give Google 8 seconds (Netlify stops functions at 10)
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000)
  let res
  try { res = await fetch(u, { headers: { 'User-Agent': 'KlassChamp/1.0' }, signal: ctl.signal }) }
  catch (e) { throw new Error(e.name === 'AbortError' ? "Google didn't answer in time — check it's the 'Secret address in iCal format'" : 'Could not reach that address') }
  finally { clearTimeout(timer) }
  if (!res.ok) throw new Error(`The calendar address returned ${res.status}`)
  const text = await res.text()
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error("That address isn't an iCal calendar (use the 'Secret address in iCal format')")
  return text
}

function eventsFrom(text, from, to, feed) {
  const data = ical.sync.parseICS(text)
  const out = []
  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== 'VEVENT' || ev.status === 'CANCELLED') continue
    let occ = []
    try { occ = ical.expandRecurringEvent(ev, { from, to }) } catch { occ = [] }
    for (const o of occ) {
      const start = new Date(o.start), end = new Date(o.end || o.start)
      const allDay = !!(o.isFullDay ?? (ev.datetype === 'date'))
      out.push({
        id: `${ev.uid}|${start.toISOString()}`, uid: ev.uid,
        feedId: feed?.id || null, feed: feed?.name || '', colour: feed?.colour || '#378ADD',
        title: String(ev.summary || '(no title)'), location: ev.location ? String(ev.location) : '',
        description: ev.description ? String(ev.description).slice(0, 1000) : '',
        allDay, start: start.toISOString(), end: end.toISOString(),
      })
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

exports.handler = async (event) => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svc) return json(500, { error: 'Service key not configured' })
  const S = { apikey: svc, Authorization: `Bearer ${svc}` }
  const auth = event.headers.authorization || event.headers.Authorization
  if (!auth) return json(401, { error: 'Missing session' })

  try {
    // who's asking -> which calendars they may see
    const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } })
    if (!u.ok) return json(401, { error: 'Invalid or expired session' })
    const caller = await u.json()
    const rows = await (await fetch(`${url}/rest/v1/members?auth_id=eq.${caller.id}&select=role`, { headers: S })).json()
    const roles = (rows || []).map(r => r.role)
    const isAdmin = roles.includes('admin')
    const isStaff = isAdmin || roles.some(r => ['head_coach', 'captain', 'coach', 'leader'].includes(r))
    const allowed = isAdmin ? ['admin', 'staff', 'everyone'] : isStaff ? ['staff', 'everyone'] : ['everyone']

    if (event.httpMethod === 'POST') {
      if (!isAdmin) return json(403, { error: 'Admins only' })
      const body = JSON.parse(event.body || '{}')
      const from = new Date(); const to = new Date(Date.now() + 180 * 86400000)
      const evs = eventsFrom(await fetchIcs(body.test_url), from, to, null)
      return json(200, { ok: true, count: evs.length, sample: evs.slice(0, 5).map(e => ({ title: e.title, start: e.start, allDay: e.allDay })) })
    }

    const q = event.queryStringParameters || {}
    const from = q.from ? new Date(q.from + 'T00:00:00Z') : new Date(Date.now() - 31 * 86400000)
    const to = q.to ? new Date(q.to + 'T23:59:59Z') : new Date(Date.now() + 120 * 86400000)
    if (to - from > 400 * 86400000) return json(400, { error: 'Range too long' })
    const feeds = await (await fetch(`${url}/rest/v1/google_calendar_feeds?active=eq.true&visibility=in.(${allowed.join(',')})&select=id,name,ics_url,colour`, { headers: S })).json()
    if (!Array.isArray(feeds)) return json(200, { events: [], feeds: [] })
    const results = await Promise.allSettled(feeds.map(async f => eventsFrom(await fetchIcs(f.ics_url), from, to, f)))
    const events = [], errors = []
    results.forEach((r, i) => r.status === 'fulfilled' ? events.push(...r.value) : errors.push({ feed: feeds[i].name, error: r.reason?.message }))
    return json(200, { events, feeds: feeds.map(f => ({ id: f.id, name: f.name, colour: f.colour })), errors })
  } catch (e) {
    return json(500, { error: e.message })
  }
}
