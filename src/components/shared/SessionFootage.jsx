import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import FightFootagePlayer from './FightFootagePlayer.jsx'

// 🎥 Session footage (coach view, testing): CCTV clips recorded during sessions this athlete
// attended, for the classes chosen below (settings 'footage_classes'). Clips play through the
// usual secure player. Athletes don't see this yet.
const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const mins = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
const at = (date, m) => { const d = new Date(date + 'T00:00:00'); d.setMinutes(m); return d }

// starting suggestion, matched by name/day/time (confirm in the picker)
const SUGGEST = c => {
  const n = (c.name || '').toLowerCase(), day = String(c.day_of_week || '').toLowerCase(), t = String(c.start_time || '').slice(0, 5)
  return /\bpts?\b.*register/.test(n) || /day session/.test(n) || /khaos/.test(n) ||
    (/boxing/.test(n) && /^wed/.test(day)) || (/^sat/.test(day) && t === '09:30')
}

export default function SessionFootage({ studentId, days = 45, onCount }) {
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
  useEffect(() => { if (sessions && onCount) onCount(sessions.reduce((n, x) => n + (x.clips?.length || 0), 0)) }, [sessions]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!studentId || !chosen) return
    setSessions(null)
    ;(async () => {
      const from = new Date(); from.setDate(from.getDate() - days)
      const { data: att } = await supabase.from('attendance').select('session_date, class_id')
        .eq('student_id', studentId).in('class_id', chosen.length ? chosen : ['00000000-0000-0000-0000-000000000000'])
        .gte('session_date', from.toISOString().slice(0, 10)).order('session_date', { ascending: false })
      const list = (att || []).map(a => ({ date: a.session_date, cls: classes.find(c => c.id === a.class_id) })).filter(x => x.cls)
      if (!list.length) { setSessions([]); return }
      const minDate = list[list.length - 1].date, maxDate = list[0].date
      const { data: clips } = await supabase.from('cctv_clips').select('id, camera_name, recorded_at, duration_seconds, storage_path')
        .gte('recorded_at', minDate + 'T00:00:00').lte('recorded_at', maxDate + 'T23:59:59').order('recorded_at')
      setSessions(list.map(s => {
        const sm = mins(s.cls.start_time), em = mins(s.cls.end_time) ?? (sm != null ? sm + 60 : null)
        const start = at(s.date, (sm ?? 0) - 10), end = at(s.date, (em ?? 1440) + 10)   // 10 min either side
        return { ...s, clips: (clips || []).filter(c => {
          const cs = new Date(c.recorded_at), ce = new Date(cs.getTime() + (c.duration_seconds || 0) * 1000)
          return cs <= end && ce >= start
        }) }
      }))
    })()
  }, [studentId, chosen, classes])

  async function saveChosen(ids) {
    setChosen(ids)
    const { error } = await supabase.from('settings').upsert({ key: 'footage_classes', value: ids }, { onConflict: 'key' })
    if (error) alert('Could not save the classes: ' + error.message)
  }
  async function play(clip) {
    setOpening(clip.id)
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('cctv-presigned-url', { body: { storage_path: clip.storage_path }, headers: { Authorization: `Bearer ${session?.access_token}` } })
    setOpening(null)
    if (error || data?.error) return alert("Couldn't open the clip: " + (data?.error || error.message))
    setPlayer({ url: data.url, clip })
  }

  const chosenSet = useMemo(() => new Set(chosen || []), [chosen])
  const withClips = (sessions || []).filter(s => s.clips.length)
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>🎥 Session footage <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>coaches only — testing</span></h2>
        {isAdmin && <button className="btn btn-sm" onClick={() => setPicking(v => !v)}>{picking ? 'Done' : '⚙ Classes'}</button>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>CCTV clips recorded during sessions this athlete attended (last {days} days), for the chosen classes.</p>

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
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {s.clips.map(c => (
                    <button key={c.id} className="btn btn-sm" disabled={opening === c.id} onClick={() => play(c)}>
                      ▶ {c.camera_name} {new Date(c.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{c.duration_seconds ? ` · ${Math.round(c.duration_seconds / 60)}m` : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

      {player && (
        <FightFootagePlayer videoUrl={player.url} title={`${player.clip.camera_name} — ${new Date(player.clip.recorded_at).toLocaleString('en-GB')}`}
          cctvClipId={player.clip.id} storagePath={player.clip.storage_path} isCoach onClose={() => setPlayer(null)} />
      )}
    </div>
  )
}
