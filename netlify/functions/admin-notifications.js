// Runs every 15 minutes (schedule in netlify.toml). Sends phone notifications to every admin
// who has turned notifications on (🔔 button at the top of the CRM):
//   • 📥 "You have a new enquiry" -- for enquiries added since the last check, from anywhere
//        (website emails, Facebook leads, CSV import, typed in), plus how many are still to contact
//   • 🎂 "It's ...'s birthday today" -- once a day, the first run after 8am UK time
// Uses the existing send-push Supabase function. Remembers what it has sent in Settings,
// so nothing is sent twice.
const TZ = 'Europe/London'

exports.handler = async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return { statusCode: 500, body: 'Missing environment variables' }
  const H = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
  const db = async (path, opts = {}) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status} ${await r.text()}`)
    return r.status === 204 ? null : r.json()
  }
  const getSetting = async key => (await db(`settings?key=eq.${key}&select=value`))?.[0]?.value ?? null
  const setSetting = (key, value) => db('settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) })

  const admins = (await db('members?role=eq.admin&select=id')) || []
  async function pushAll(title, body, url) {
    let sent = 0
    for (const a of admins) {
      const r = await fetch(`${supabaseUrl}/functions/v1/send-push`, { method: 'POST', headers: H, body: JSON.stringify({ member_id: a.id, title, body, url }) })
      const j = await r.json().catch(() => ({}))
      sent += j.sent || 0
    }
    return sent
  }
  const report = {}

  // ── 1. New enquiries ──────────────────────────────────────────────
  try {
    const last = await getSetting('push_enquiries_last')
    const now = new Date().toISOString()
    if (!last) {
      await setSetting('push_enquiries_last', now)          // first run: start from now, don't announce old ones
      report.enquiries = 'started'
    } else {
      const fresh = await db(`enquiries?select=name,contact_method,created_at&created_at=gt.${encodeURIComponent(last)}&order=created_at.asc`)
      if (fresh.length) {
        const toContact = (await db('enquiries?select=id&status=eq.not_started')).length
        const via = { email: 'email', facebook_ad: 'Facebook / Instagram', call: 'phone', text: 'text', in_person: 'in person' }
        const who = fresh.slice(0, 3).map(e => `${(e.name && e.name !== 'Unknown') ? e.name : 'Someone'}${via[e.contact_method] ? ` (${via[e.contact_method]})` : ''}`).join(', ')
          + (fresh.length > 3 ? ` + ${fresh.length - 3} more` : '')
        report.enquiries = await pushAll(
          fresh.length === 1 ? '📥 You have a new enquiry' : `📥 You have ${fresh.length} new enquiries`,
          `${who}. You have ${toContact} ${toContact === 1 ? 'enquiry' : 'enquiries'} to contact.`,
          '/crm',
        )
        await setSetting('push_enquiries_last', fresh[fresh.length - 1].created_at)
      }
    }
  } catch (e) { report.enquiriesError = e.message; console.error('enquiry push:', e.message) }

  // ── 2. Birthdays today (once a day, after 8am UK) ────────────────
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map(p => [p.type, p.value]))
    const today = `${parts.year}-${parts.month}-${parts.day}`
    if (Number(parts.hour) >= 8 && (await getSetting('push_birthdays_day')) !== today) {
      const people = await db(`members?select=first_name,last_name,date_of_birth,status,students!inner(id)&status=eq.active&date_of_birth=not.is.null`)
      const bdays = people.filter(m => String(m.date_of_birth).slice(5, 10) === `${parts.month}-${parts.day}`)
      if (bdays.length) {
        const names = bdays.map(m => `${m.first_name || ''} ${m.last_name || ''}`.trim())
        const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
        report.birthdays = await pushAll(
          names.length === 1 ? '🎂 Birthday today' : `🎂 ${names.length} birthdays today`,
          names.length === 1 ? `It's ${list}'s birthday today.` : `It's ${list}'s birthdays today.`,
          '/crm',
        )
      }
      await setSetting('push_birthdays_day', today)
    }
  } catch (e) { report.birthdaysError = e.message; console.error('birthday push:', e.message) }

  console.log('admin-notifications', JSON.stringify(report))
  return { statusCode: 200, body: JSON.stringify(report) }
}
