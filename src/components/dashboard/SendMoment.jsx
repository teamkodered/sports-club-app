import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fetchAll } from '../../lib/fetchAll.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// 📸 Coaches: send a photo from a session for the club's social media.
// Tag everyone who can be recognised. If anyone tagged hasn't got media consent = Yes the photo
// can't be sent (the database checks again on save). Phone photos only -- never CCTV.
const nameOf = s => `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()

// shrink big phone photos before upload (longest side 1600px, JPEG)
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read the photo'))), 'image/jpeg', 0.85)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('That file isn\u2019t a photo this phone can read'))
    img.src = URL.createObjectURL(file)
  })
}

export default function SendMoment() {
  const { session, profile, isAdmin, isCoach, isHeadCoach, isLeader } = useAuth()
  const [open, setOpen] = useState(false)
  const [students, setStudents] = useState(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [tagged, setTagged] = useState([])
  const [noOne, setNoOne] = useState(false)
  const [search, setSearch] = useState('')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function start() {
    setOpen(true); setDone(false)
    if (!students) {
      const { data } = await fetchAll(() => supabase.from('students').select('id, media_restriction, members(first_name, last_name, status)').order('id'))
      setStudents((data || []).filter(s => s.members?.status === 'active').sort((a, b) => nameOf(a).localeCompare(nameOf(b))))
    }
  }
  function choose(e) {
    const f = e.target.files?.[0]; if (!f) return
    setFile(f); setPreview(URL.createObjectURL(f))
  }
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2 || !students) return []
    return students.filter(s => nameOf(s).toLowerCase().includes(q) && !tagged.some(t => t.id === s.id)).slice(0, 8)
  }, [search, students, tagged])
  if (!(isAdmin || isCoach || isHeadCoach || isLeader)) return null
  const blocked = tagged.filter(s => s.media_restriction !== 'Yes')
  const canSend = file && !busy && blocked.length === 0 && (tagged.length > 0 || noOne)

  async function send() {
    if (!canSend) return
    setBusy(true)
    try {
      const blob = await shrink(file)
      const path = `${session.user.id}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('moments').upload(path, blob, { contentType: 'image/jpeg' })
      if (upErr) throw upErr
      const { data, error } = await supabase.from('moments').insert({
        photo_path: path, caption: caption.trim() || null, student_ids: tagged.map(s => s.id), no_one_identifiable: tagged.length === 0 && noOne,
        submitter_name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || null,
      }).select()
      if (error || !data?.length) throw new Error(error?.message || 'Not saved')
      setDone(true); setFile(null); setPreview(null); setTagged([]); setNoOne(false); setCaption(''); setSearch('')
    } catch (e) {
      alert("Couldn't send the photo: " + e.message)
    }
    setBusy(false)
  }

  if (!open) return (
    <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>📸 Send a moment</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>A great photo from a session? Send it for the club's social media.</div>
      </div>
      <button className="btn btn-primary" onClick={start}>Send a photo</button>
    </div>
  )

  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>📸 Send a moment</div>
        <button className="btn btn-sm" onClick={() => setOpen(false)}>Close</button>
      </div>
      {done && <div style={{ background: '#1D9E7522', color: '#1D9E75', padding: 10, borderRadius: 8, fontSize: 15, marginBottom: 10 }}>✓ Sent — thank you! Send another below.</div>}

      <label className="btn" style={{ cursor: 'pointer', fontSize: 15 }}>
        {file ? '📷 Change photo' : '📷 Choose a photo'}
        <input type="file" accept="image/*" onChange={choose} style={{ display: 'none' }} />
      </label>
      {preview && <img src={preview} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: 260, borderRadius: 8, marginTop: 10 }} />}

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Who can be recognised in it?</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={students ? 'Type a name…' : 'Loading names…'} style={{ width: '100%', fontSize: 16, padding: '9px 10px' }} />
        {matches.map(s => (
          <button key={s.id} className="btn" onClick={() => { setTagged(t => [...t, s]); setSearch(''); setNoOne(false) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 4, fontSize: 15 }}>
            {nameOf(s)} {s.media_restriction === 'Yes' ? '' : <span style={{ color: '#E24B4A', fontSize: 13 }}> — no media consent</span>}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {tagged.map(s => (
            <span key={s.id} className={`badge ${s.media_restriction === 'Yes' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 13, padding: '5px 8px', cursor: 'pointer' }}
              onClick={() => setTagged(t => t.filter(x => x.id !== s.id))}>
              {nameOf(s)} {s.media_restriction === 'Yes' ? '✓' : '⚠'} ✕
            </span>
          ))}
        </div>
        {tagged.length === 0 && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 8 }}>
            <input type="checkbox" checked={noOne} onChange={e => setNoOne(e.target.checked)} /> No one can be recognised (backs to camera, empty gym, kit…)
          </label>
        )}
        {blocked.length > 0 && (
          <div style={{ background: '#E24B4A22', color: '#E24B4A', padding: 10, borderRadius: 8, fontSize: 14, marginTop: 8 }}>
            ⚠ {blocked.map(nameOf).join(', ')} {blocked.length === 1 ? "hasn't" : "haven't"} got media consent, so this photo can't be used. Please choose a different photo.
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>What's happening? (optional)</div>
        <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Saturday sparring — great work rate" style={{ width: '100%', fontSize: 16, padding: '9px 10px' }} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>Phone photos only — not CCTV. Only the admin sees what you send.</div>
      <button className="btn btn-primary" disabled={!canSend} onClick={send} style={{ marginTop: 12, fontSize: 16, padding: '10px 18px' }}>{busy ? 'Sending…' : 'Send'}</button>
    </div>
  )
}
