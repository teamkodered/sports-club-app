import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import FightFootagePlayer from './FightFootagePlayer.jsx'
import { camLabel, wall } from './SessionFootage.jsx'

// 🎥 Athlete app: CCTV clips from MY sessions (the ones the coaches have opened up). Nothing shows if
// it's switched off or there are no clips.
const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
export default function MySessionFootage({ days = 45, viewerName = null }) {
  const [rows, setRows] = useState(null), [open, setOpen] = useState(false), [player, setPlayer] = useState(null), [opening, setOpening] = useState(null)
  useEffect(() => { supabase.rpc('kc_my_session_footage', { p_days: days }).then(({ data, error }) => setRows(error ? [] : (data || []))) }, [days])
  if (!rows || !rows.length) return null
  const sessions = []
  rows.forEach(r => {
    const k = r.session_date + '|' + r.label
    let s = sessions.find(x => x.k === k)
    if (!s) { s = { k, date: r.session_date, label: r.label, ws: r.win_start, clips: [] }; sessions.push(s) }
    if (!s.clips.some(c => c.clip_id === r.clip_id)) s.clips.push(r)
  })
  async function play(c, s) {
    setOpening(c.clip_id)
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('cctv-presigned-url', { body: { storage_path: c.storage_path }, headers: { Authorization: `Bearer ${session?.access_token}` } })
    setOpening(null)
    if (error || data?.error) return alert("Couldn't open the clip: " + (data?.error || error.message))
    const startAt = Math.max(0, Math.round((new Date(s.ws) - wall(c.recorded_at)) / 1000))
    setPlayer({ url: data.url, clip: c, startAt })
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
        <b style={{ flex: 1, fontSize: 14 }}>🎥 My session footage</b>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sessions.length} session{sessions.length === 1 ? '' : 's'} {open ? '▲' : '▼'}</span>
      </button>
      {open && sessions.map(s => (
        <div key={s.k} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{fmtDay(s.date)} · {s.label}</div>
          {/* big, easy-to-tap clip buttons: two per row, camera above the time */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {s.clips.map(c => (
              <button key={c.clip_id} type="button" className="btn" disabled={opening === c.clip_id} onClick={() => play(c, s)}
                style={{ minHeight: 56, padding: '10px 12px', justifyContent: 'flex-start', gap: 10, fontSize: 15, textAlign: 'left' }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{opening === c.clip_id ? '⏳' : '▶️'}</span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                  <b>{camLabel(c.camera_name)}</b>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{wall(c.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {player && <FightFootagePlayer viewerName={viewerName} videoUrl={player.url} autoPlay startAt={player.startAt} cctvClipId={player.clip.clip_id} storagePath={player.clip.storage_path} title={`${camLabel(player.clip.camera_name)} — ${wall(player.clip.recorded_at).toLocaleString('en-GB')}`} onClose={() => setPlayer(null)} />}
    </div>
  )
}
