import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// Settings -> 📅 Google calendars: the club's shared Google calendars, shown (read-only) in the app
// calendar. Each one uses its "Secret address in iCal format" -- kept private (admins only),
// fetched by the server. "Who can see" lets events go to staff / everyone later.
const COLOURS = ['#378ADD', '#E24B4A', '#1D9E75', '#EF9F27', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B']
const WHO = [['admin', 'Admins only'], ['staff', 'All staff'], ['everyone', 'Everyone (athletes & parents)']]

export default function GoogleCalendarsSettings() {
  const [feeds, setFeeds] = useState(null)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(null)
  const [testing, setTesting] = useState(null)   // { id|'new', result }
  const [helpOpen, setHelpOpen] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('google_calendar_feeds').select('*').order('created_at')
    if (error) { setErr(/google_calendar_feeds/.test(error.message) ? 'Run supabase_google_calendars.sql to switch this on.' : error.message); setFeeds([]); return }
    setFeeds(data || [])
  }
  useEffect(() => { load() }, [])

  async function test(id, url) {
    setTesting({ id, result: 'Checking…' })
    const { data: { session } } = await supabase.auth.getSession()
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000)
    let r = {}
    try {
      const res = await fetch('/.netlify/functions/calendar-events', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ test_url: url }), signal: ctl.signal })
      r = await res.json().catch(() => ({ error: res.status === 404 ? "The calendar link isn't live yet — wait for Netlify's deploy to finish, then try again" : `The server answered ${res.status}` }))
    } catch (e) {
      r = { error: e.name === 'AbortError' ? 'No answer after 15 seconds — check the address is the "Secret address in iCal format", or try again in a minute' : e.message }
    } finally { clearTimeout(timer) }
    setTesting({ id, result: r.ok ? `✓ Working — ${r.count} event${r.count === 1 ? '' : 's'} in the next 6 months${r.sample?.length ? `, e.g. "${r.sample[0].title}"` : ''}` : `✗ ${r.error || 'Could not read it'}` })
    return !!r.ok
  }
  async function save() {
    const a = adding
    if (!a.name.trim() || !a.ics_url.trim()) return alert('Add a name and the secret iCal address.')
    if (!(await test('new', a.ics_url))) return
    const { error } = await supabase.from('google_calendar_feeds').insert({ name: a.name.trim(), ics_url: a.ics_url.trim(), colour: a.colour, visibility: a.visibility })
    if (error) return alert(error.message)
    setAdding(null); setTesting(null); load()
  }
  async function update(f, patch) {
    setFeeds(prev => prev.map(x => x.id === f.id ? { ...x, ...patch } : x))
    const { error } = await supabase.from('google_calendar_feeds').update(patch).eq('id', f.id)
    if (error) { alert(error.message); load() }
  }
  async function remove(f) {
    if (!window.confirm(`Remove "${f.name}" from the app calendar? (Nothing changes in Google. Club holidays already made from it stay.)`)) return
    await supabase.from('google_calendar_feeds').delete().eq('id', f.id); load()
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13 }}><b>📅 Google calendars</b>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Your shared Google calendars, shown in the app calendar (read-only — keep editing in Google).</div></div>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setHelpOpen(v => !v)}>How to find the address</button>
          <button className="btn btn-sm btn-primary" onClick={() => { setAdding({ name: '', ics_url: '', colour: COLOURS[(feeds?.length || 0) % COLOURS.length], visibility: 'admin' }); setTesting(null) }}>+ Add calendar</button>
        </span>
      </div>
      {helpOpen && (
        <ol style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
          <li>On a computer, open <b>calendar.google.com</b>.</li>
          <li>On the left, hover over the calendar (e.g. "Club closures") → <b>⋮</b> → <b>Settings and sharing</b>.</li>
          <li>Scroll down to <b>Integrate calendar</b> → copy <b>Secret address in iCal format</b> (ends in <code>basic.ics</code>).</li>
          <li>Paste it here. Keep it private — anyone with that address can read the calendar.</li>
        </ol>
      )}
      {err && <div style={{ color: '#E24B4A', fontSize: 13, marginTop: 8 }}>{err}</div>}
      {(feeds || []).map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: f.colour, flexShrink: 0 }} />
          <b style={{ fontSize: 13, flex: '1 1 140px', opacity: f.active ? 1 : 0.5 }}>{f.name}</b>
          <select value={f.visibility} onChange={e => update(f, { visibility: e.target.value })} style={{ fontSize: 12 }} aria-label="Who can see it">
            {WHO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select value={f.colour} onChange={e => update(f, { colour: e.target.value })} style={{ fontSize: 12, color: f.colour }} aria-label="Colour">
            {COLOURS.map(c => <option key={c} value={c} style={{ color: c }}>● colour</option>)}
          </select>
          <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={f.active} onChange={e => update(f, { active: e.target.checked })} /> Show</label>
          <button className="btn btn-sm" onClick={() => test(f.id, f.ics_url)}>Test</button>
          <button className="btn btn-sm" onClick={() => remove(f)}>Remove</button>
          {testing?.id === f.id && <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--text-secondary)' }}>{testing.result}</div>}
        </div>
      ))}
      {feeds?.length === 0 && !adding && !err && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>No calendars yet.</p>}
      {adding && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={adding.name} onChange={e => setAdding(a => ({ ...a, name: e.target.value }))} placeholder="Name, e.g. Club closures & holidays" />
          <input value={adding.ics_url} onChange={e => setAdding(a => ({ ...a, ics_url: e.target.value }))} placeholder="Secret address in iCal format (https://calendar.google.com/…/basic.ics)" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>Colour</span>
            {COLOURS.map(c => <button key={c} type="button" onClick={() => setAdding(a => ({ ...a, colour: c }))} aria-label={c}
              style={{ width: 22, height: 22, borderRadius: 11, background: c, border: adding.colour === c ? '3px solid var(--text)' : '1px solid var(--border)', cursor: 'pointer' }} />)}
            <select value={adding.visibility} onChange={e => setAdding(a => ({ ...a, visibility: e.target.value }))} style={{ fontSize: 12, marginLeft: 'auto' }}>
              {WHO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {testing?.id === 'new' && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{testing.result}</div>}
          <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" onClick={save}>Test & save</button><button className="btn" onClick={() => { setAdding(null); setTesting(null) }}>Cancel</button></div>
        </div>
      )}
    </div>
  )
}
