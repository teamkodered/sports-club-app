import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import SessionFootage from '../shared/SessionFootage.jsx'
import FightFootagePlayer from '../shared/FightFootagePlayer.jsx'
import MediaViewer from '../shared/MediaViewer.jsx'

// Media > Athletes (Oct 2026): a register-style list (filters at the top); press a name
// to see that athlete's footage underneath -- Training (CCTV), Fights, Opponents,
// Uploads (grouped by the section they were uploaded from). Each heading shows a count.
const SECTION_NAMES = { mentality: '🧠 Mentality', tactical: '🧩 Tactical', technique: '🥊 Technical', physical: '💪 Physical', wellbeing: '🌱 Foundation', test: '📋 Tests', notes: '📝 Notes' }
const nameOf = s => `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()

export default function AthleteMedia({ students = [], useOwnFilters = true }) {
  // useOwnFilters = false: the list is already filtered by the caller (coach dashboard TEAM banner)
  const [show, setShow] = useState('all') // all | kr | krba
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)
  const list = useMemo(() => students
    .filter(s => s.is_kr || s.is_pts || s.discipline === 'KRBA')
    .filter(s => show === 'all' || (show === 'krba' ? s.discipline === 'KRBA' : s.discipline !== 'KRBA'))
    .filter(s => !search || nameOf(s).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b))), [students, show, search])
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search athlete…" style={{ flex: '1 1 160px', minWidth: 140 }} />
        {useOwnFilters && [['all', 'All'], ['kr', 'KR'], ['krba', 'KRBA']].map(([k, l]) => <button key={k} type="button" className={show === k ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setShow(k)}>{l}</button>)}
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{list.length} athletes</span>
      </div>
      {list.map(s => (
        <div key={s.id} className="card" style={{ padding: 0, marginBottom: 6, overflow: 'hidden' }}>
          <button type="button" onClick={() => setOpen(o => o === s.id ? null : s.id)}
            style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#9B1C1C', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {s.photo_url ? <img src={s.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : `${s.members?.first_name?.[0] || ''}${s.members?.last_name?.[0] || ''}`}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>{nameOf(s)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.discipline === 'KRBA' ? 'KRBA' : 'KR'}{s.in_comp ? ' · In comp' : ''}</span>
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>{open === s.id ? '▾' : '▸'}</span>
          </button>
          {open === s.id && <AthleteFolders student={s} />}
        </div>
      ))}
      {!list.length && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No athletes match.</p>}
    </div>
  )
}

function Folder({ icon, title, count, children, defaultOpen = false }) {
  const [o, setO] = useState(defaultOpen)
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button type="button" onClick={() => setO(v => !v)} style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px' }}>
        <span>{icon}</span><b style={{ flex: 1, fontSize: 13 }}>{title}</b>
        <span style={{ minWidth: 22, textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: count && !String(count).startsWith('0 ') ? '#378ADD' : 'var(--bg-secondary)', color: count && !String(count).startsWith('0 ') ? '#fff' : 'var(--text-tertiary)' }}>{count ?? '…'}</span>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{o ? '▲' : '▼'}</span>
      </button>
      {o && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
    </div>
  )
}

function AthleteFolders({ student }) {
  const [fights, setFights] = useState(null)
  const [opps, setOpps] = useState(null)
  const [uploads, setUploads] = useState(null)
  const [cctvCount, setCctvCount] = useState(null)
  const [playing, setPlaying] = useState(null)
  const [viewer, setViewer] = useState(null)
  useEffect(() => {
    supabase.from('fight_footage_featured').select('fight_footage(*)').eq('student_id', student.id)
      .then(({ data }) => setFights((data || []).map(r => r.fight_footage).filter(f => f && f.kind !== 'study').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))), () => setFights([]))
    supabase.from('opponent_notes').select('*').eq('student_id', student.id).order('created_at', { ascending: false })
      .then(({ data }) => setOpps(data || []), () => setOpps([]))
    supabase.from('athlete_profiles').select('media_files').eq('student_id', student.id).maybeSingle()
      .then(({ data }) => setUploads(Array.isArray(data?.media_files) ? data.media_files : []), () => setUploads([]))
  }, [student.id])

  async function playFight(f) {
    const { data: sess } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess?.session?.access_token}` }, body: JSON.stringify({ mode: 'read', footage_id: f.id }),
    })
    const d = await res.json()
    if (d.error) { alert('Could not open this video: ' + d.error); return }
    setPlaying({ url: d.url, item: f })
  }

  const opponents = useMemo(() => { const m = {}; for (const n of opps || []) (m[n.opponent_name || 'Unknown'] ||= []).push(n); return m }, [opps])
  const bySection = useMemo(() => { const m = {}; for (const f of uploads || []) (m[f.section_key || 'other'] ||= []).push(f); return m }, [uploads])
  const thumb = f => (
    <button key={f.url} type="button" onClick={() => setViewer({ items: uploads.filter(x => (x.section_key || 'other') === (f.section_key || 'other')), index: uploads.filter(x => (x.section_key || 'other') === (f.section_key || 'other')).indexOf(f) })}
      style={{ all: 'unset', cursor: 'pointer', width: 64, height: 64, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }} title={f.name}>
      {f.type?.startsWith('image') ? <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : f.type?.includes('video') ? '🎬' : '📄'}
    </button>
  )
  return (
    <div>
      <Folder icon="📹" title="Training (CCTV)" count={cctvCount == null ? null : `${cctvCount.sessions} session${cctvCount.sessions === 1 ? '' : 's'} · ${cctvCount.clips} clip${cctvCount.clips === 1 ? '' : 's'}`}>
        <SessionFootage studentId={student.id} onCount={setCctvCount} />
      </Folder>
      <Folder icon="🥊" title="Fights" count={fights?.length}>
        {fights?.length ? fights.map(f => (
          <button key={f.id} type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }} onClick={() => playFight(f)}>
            <span>▶ {f.title}</span><span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{f.created_at ? new Date(f.created_at).toLocaleDateString('en-GB') : ''}</span>
          </button>
        )) : <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>No fight footage featuring them.</p>}
      </Folder>
      <Folder icon="👤" title="Opponents" count={opps ? Object.keys(opponents).length : null}>
        {Object.keys(opponents).length ? Object.entries(opponents).map(([name, notes]) => (
          <div key={name} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{name} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>· {notes.length} note{notes.length === 1 ? '' : 's'}</span></div>
            {notes.slice(0, 3).map(n => <div key={n.id} style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 8 }}>• {n.note_text || n.notes || n.text || ''}{n.video_url ? <> · <a href={n.video_url} target="_blank" rel="noreferrer">video</a></> : null}</div>)}
          </div>
        )) : <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>No opponents recorded.</p>}
      </Folder>
      <Folder icon="⬆️" title="Uploads" count={uploads?.length}>
        {uploads?.length ? Object.entries(bySection).map(([sec, files]) => (
          <div key={sec} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{SECTION_NAMES[sec] || sec} <span style={{ fontSize: 10, padding: '0 6px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>{files.length}</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{files.map(thumb)}</div>
          </div>
        )) : <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Nothing uploaded yet.</p>}
      </Folder>
      {playing && <FightFootagePlayer videoUrl={playing.url} title={playing.item.title} footageId={playing.item.id} storagePath={playing.item.storage_path} isCoach onClose={() => setPlaying(null)} />}
      {viewer && <MediaViewer items={viewer.items} start={Math.max(0, viewer.index)} onClose={() => setViewer(null)} />}
    </div>
  )
}
