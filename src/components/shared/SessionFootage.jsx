import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import FightFootagePlayer from './FightFootagePlayer.jsx'

// 🎥 Session footage (coach view, testing): CCTV clips recorded during sessions this athlete
// attended, for the classes chosen below (settings 'footage_classes'). Clips play through the
// usual secure player. Athletes don't see this yet.
// Camera names: 01 = Bags, 02 = Ring, the third camera (04) = Main
const CAMS = [{ key: '1', label: 'Bags' }, { key: '2', label: 'Ring' }, { key: '3', label: 'Main' }]
const camKey = n => { const m = String(n || '').match(/(\d+)/); const v = m ? parseInt(m[1]) : 0; return v === 1 ? '1' : v === 2 ? '2' : '3' }
export const camLabel = n => CAMS.find(c => c.key === camKey(n))?.label || n
const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const mins = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
const at = (date, m) => { const d = new Date(date + 'T00:00:00'); d.setMinutes(m); return d }

// starting suggestion, matched by name/day/time (confirm in the picker)
const SUGGEST = c => {
  const n = (c.name || '').toLowerCase(), day = String(c.day_of_week || '').toLowerCase(), t = String(c.start_time || '').slice(0, 5)
  return /\bpts?\b.*register/.test(n) || /day session/.test(n) || /khaos/.test(n) ||
    (/boxing/.test(n) && /^wed/.test(day)) || (/^sat/.test(day) && t === '09:30')
}

export default function SessionFootage({ studentId, days: daysDefault = 45, onCount }) {
  const [days, setDays] = useState(daysDefault) // look-back range (30 / 45 / 90 / 180 / 365 days)
  const { isAdmin } = useAuth()
  const [classes, setClasses] = useState([])
  const [chosen, setChosen] = useState(null)      // class ids
  const [picking, setPicking] = useState(false)
  const [sessions, setSessions] = useState(null)  // [{ date, cls, clips: [] }]
  const [player, setPlayer] = useState(null)      // { url, clip }
  const [opening, setOpening] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('classes').select('id, name, day_of_week, start_time, end_time').eq('active', true).order('day_of_week').order('start_time'),
      supabase.from('settings').select('value').eq('key', 'footage_classes').maybeSingle(),
    ]).then(([c, s]) => {
      setClasses(c.data || [])
      setChosen(Array.isArray(s.data?.value) ? s.data.value : (c.data || []).filter(SUGGEST).map(x => x.id))
    })
  }, [])

  // tell the parent how many clips there are (Media > Athletes header counts)
  useEffect(() => { if (sessions && onCount) { const w = sessions.filter(x => x.clips?.length); onCount({ sessions: w.length, clips: w.reduce((n, x) => n + x.clips.length, 0) }) } }, [sessions]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!studentId || !chosen) return
    setSessions(null)
    ;(async () => {
      const from = new Date(); from.setDate(from.getDate() - days)
      // ticked classes, plus check-ins with no timetabled class (e.g. open-gym training) using their own times
      const ids = chosen.length ? chosen : ['00000000-0000-0000-0000-000000000000']
      const { data: att } = await supabase.from('attendance').select('session_date, class_id, attended_at, checked_out_at')
        .eq('student_id', studentId).or(`class_id.in.(${ids.join(',')}),class_id.is.null`)
        .gte('session_date', from.toISOString().slice(0, 10)).order('session_date', { ascending: false })
      const hhmm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
      const list = (att || []).map(a => {
        if (a.class_id) return { date: a.session_date, cls: classes.find(c => c.id === a.class_id) }
        if (!a.attended_at || String(a.attended_at).includes('T12:00:00')) return null   // no real check-in time
        const end = a.checked_out_at ? hhmm(a.checked_out_at) : hhmm(new Date(new Date(a.attended_at).getTime() + 90 * 60000))
        return { date: a.session_date, cls: { id: 'checkin-' + a.attended_at, name: 'Check-in', start_time: hhmm(a.attended_at), end_time: end } }
      }).filter(x => x && x.cls)
      if (!list.length) { setSessions([]); return }
      const minDate = list[list.length - 1].date, maxDate = list[0].date
      const { data: clips } = await supabase.from('cctv_clips').select('id, camera_name, recorded_at, duration_seconds, storage_path')
        .gte('recorded_at', minDate + 'T00:00:00').lte('recorded_at', maxDate + 'T23:59:59').order('recorded_at')
      setSessions(list.map(s => {
        const sm = mins(s.cls.start_time), em = mins(s.cls.end_time) ?? (sm != null ? sm + 60 : null)
        const start = at(s.date, (sm ?? 0) - 10), end = at(s.date, (em ?? 1440) + 10)   // 10 min either side
        return { ...s, clips: (clips || []).filter(c => {
          const cs = new Date(c.recorded_at), ce = new Date(cs.getTime() + (c.duration_seconds || 0) * 1000)
          // only files that cover at least 5 minutes of the session window (drops ones that just clip the edge)
          const overlap = Math.min(ce, end) - Math.max(cs, start)
          return overlap >= 5 * 60000
        }) }
      }))
    })()
  }, [studentId, chosen, classes, days])

  async function saveChosen(ids) {
    setChosen(ids)
    const { error } = await supabase.from('settings').upsert({ key: 'footage_classes', value: ids }, { onConflict: 'key' })
    if (error) alert('Could not save the classes: ' + error.message)
  }
  async function play(clip, sess) {
    setOpening(clip.id)
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('cctv-presigned-url', { body: { storage_path: clip.storage_path }, headers: { Authorization: `Bearer ${session?.access_token}` } })
    setOpening(null)
    if (error || data?.error) return alert("Couldn't open the clip: " + (data?.error || error.message))
    // start at the class start (inside a long recording), not the start of the file
    let startAt = 0
    if (sess) { const sm = mins(sess.cls.start_time); if (sm != null) startAt = Math.max(0, Math.round((at(sess.date, sm) - new Date(clip.recorded_at)) / 1000)) }
    setPlayer({ url: data.url, clip, startAt })
  }

  const chosenSet = useMemo(() => new Set(chosen || []), [chosen])
  const withClips = (sessions || []).filter(s => s.clips.length)
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>🎥 Session footage <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>coaches only — testing</span></h2>
        {isAdmin && <button className="btn btn-sm" onClick={() => setPicking(v => !v)}>{picking ? 'Done' : '⚙ Classes'}</button>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>CCTV clips recorded during sessions this athlete attended -- the chosen classes plus their own check-ins with no class. Clips open at the session start.</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {[30, 45, 90, 180, 365].map(d => <button key={d} type="button" className={days === d ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setDays(d)}>{d === 365 ? '1 yr' : `${d} days`}</button>)}
      </div>

      {picking && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 10, maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Footage is matched for these classes (saved for everyone):</div>
          {classes.map(c => (
            <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
              <input type="checkbox" checked={chosenSet.has(c.id)} onChange={() => saveChosen(chosenSet.has(c.id) ? chosen.filter(x => x !== c.id) : [...chosen, c.id])} />
              <b style={{ fontWeight: 600 }}>{c.day_of_week} {String(c.start_time).slice(0, 5)}</b> {c.name}
            </label>
          ))}
        </div>
      )}

      {sessions === null ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</p>
        : !sessions.length ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No sessions attended in the chosen classes recently.</p>
        : (
          <>
            {!withClips.length && <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sessions.length} session{sessions.length === 1 ? '' : 's'} attended, but no CCTV clips recorded during them.</p>}
            {withClips.map(s => (
              <div key={s.date + s.cls.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{fmtDay(s.date)} · {s.cls.name} {String(s.cls.start_time).slice(0, 5)}</div>
                {/* three columns, one per camera (Bags / Ring / Main), square tiles in time order */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                  {CAMS.map(cam => (
                    <div key={cam.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>{cam.label}</div>
                      {s.clips.filter(c => camKey(c.camera_name) === cam.key).map(c => (
                        <button key={c.id} className="btn" disabled={opening === c.id} onClick={() => play(c, s)}
                          style={{ aspectRatio: '1 / 1', width: '100%', padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 10 }}>
                          <span style={{ fontSize: 16 }}>▶</span>
                          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700 }}>{new Date(c.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                          {c.duration_seconds ? <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{Math.round(c.duration_seconds / 60)} min</span> : null}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

      {player && (
        <FightFootagePlayer videoUrl={player.url} title={`${camLabel(player.clip.camera_name)} — ${new Date(player.clip.recorded_at).toLocaleString('en-GB')}`}
          cctvClipId={player.clip.id} storagePath={player.clip.storage_path} isCoach startAt={player.startAt || 0} onClose={() => setPlayer(null)} />
      )}
    </div>
  )
}
