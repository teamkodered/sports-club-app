import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { FOOTAGE_ACCESS_MODES, footageAccessLabel } from '../lib/mediaConstants.js'
import { saveFootageAthletes } from '../lib/fightFootageTags.js'
import AthletePicker from '../components/shared/AthletePicker.jsx'
import FightFootagePlayer from '../components/shared/FightFootagePlayer.jsx'
import { captureFrames } from '../lib/videoThumbs.js'

// Media > 📚 Study (Oct 2026): study videos (uploaded) and links (YouTube or any
// web page). Stored in fight_footage with kind = 'study', so sharing works exactly
// like other videos: Coach only / Athletes in it / Specific athletes / Whole team,
// using the same athlete read rules. Study items skip the Uploads "Awaiting
// publish" step -- they're live as soon as they're added, and who sees them is
// decided by who-can-see (default Coach only).
const EMPTY = { kind: 'video', title: '', notes: '', url: '', files: [], accessMode: 'coach_only', featuredIds: new Set(), viewerIds: new Set() }

export default function Study({ studyFootage = [], students = [], studentName, load, startUpload, startBulkUpload }) {
  const [form, setForm] = useState(null) // null = closed
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [edit, setEdit] = useState(null)
  const [playing, setPlaying] = useState(null) // { url, item }
  const studentById = Object.fromEntries(students.map(s => [s.id, s]))
  const names = ids => ids.map(id => studentById[id]).filter(Boolean).map(studentName).join(', ')

  async function add() {
    const f = form
    const many = f.kind === 'video' && f.files.length > 1
    if (!many && !f.title.trim()) { alert('Give it a title.'); return }
    if (f.kind === 'link') {
      let url = f.url.trim()
      if (!url) { alert('Paste the link.'); return }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      setSaving(true)
      try {
        const { data, error } = await supabase.from('fight_footage').insert({
          kind: 'study', link_url: url, title: f.title.trim(), description: f.notes.trim() || null, access_mode: f.accessMode, published: true,
        }).select().single()
        if (error) throw error
        await saveFootageAthletes(data.id, { accessMode: f.accessMode, featuredIds: f.featuredIds, viewerIds: f.viewerIds })
        setForm(null); load()
      } catch (err) { alert('Could not add link: ' + err.message) } finally { setSaving(false) }
    } else {
      if (!f.files.length) { alert('Choose a video.'); return }
      // queued like other uploads (progress shows in the upload banner); the list refreshes when it's done.
      // A small picture is grabbed from each video first (on the device) and saved with it.
      setSaving(true)
      const withThumbs = []
      for (const file of f.files) withThumbs.push({ file, thumb: (await captureFrames(file)).thumb })
      setSaving(false)
      if (many) {
        // several videos: each is its own study item, titled from its filename, same sharing for all
        startBulkUpload(withThumbs.map(({ file, thumb }) => ({ file, thumb, title: file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '), featuredIds: f.featuredIds })),
          { accessMode: f.accessMode, viewerIds: f.viewerIds, kind: 'study' })
      } else {
        startUpload({ file: f.files[0], thumb: withThumbs[0].thumb, title: f.title.trim(), description: f.notes, accessMode: f.accessMode, featuredIds: f.featuredIds, viewerIds: f.viewerIds, kind: 'study' })
      }
      setForm(null)
    }
  }

  async function open(item) {
    if (item.link_url) { window.open(item.link_url, '_blank', 'noopener'); return }
    const { data: sessionData } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData?.session?.access_token}` },
      body: JSON.stringify({ mode: 'read', footage_id: item.id }),
    })
    const data = await res.json()
    if (data.error) { alert("Couldn't open this video: " + data.error); return }
    setPlaying({ url: data.url, item })
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEdit({ accessMode: item.access_mode, featuredIds: new Set((item.fight_footage_featured || []).map(a => a.student_id)), viewerIds: new Set((item.fight_footage_athletes || []).map(a => a.student_id)) })
  }
  async function saveEdit(item) {
    const { error } = await supabase.from('fight_footage').update({ access_mode: edit.accessMode }).eq('id', item.id)
    if (error) { alert('Could not save: ' + error.message); return }
    try { await saveFootageAthletes(item.id, edit) } catch (err) { alert('Could not save athletes: ' + err.message); return }
    setEditingId(null); load()
  }
  async function rename(item) {
    const title = prompt('New title', item.title)
    if (title == null || !title.trim() || title.trim() === item.title) return
    const { error } = await supabase.from('fight_footage').update({ title: title.trim() }).eq('id', item.id)
    if (error) { alert('Could not rename: ' + error.message); return }
    load()
  }

  async function remove(item) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    await supabase.from('fight_footage').delete().eq('id', item.id)
    load()
  }

  // shared "who can see + athletes" block, used when adding and when editing
  const sharing = (v, set) => (
    <>
      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', margin: '4px 0 6px' }}>Who can see this?</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {FOOTAGE_ACCESS_MODES.map(m => (
          <button key={m.value} type="button" className={v.accessMode === m.value ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => set({ ...v, accessMode: m.value })}>
            {m.value === 'featured' ? 'Athletes in it' : m.label}
          </button>
        ))}
      </div>
      {v.accessMode === 'featured' && (
        <div style={{ marginBottom: 8 }}>
          <AthletePicker students={students} studentName={studentName} selected={v.featuredIds} onChange={ids => set({ ...v, featuredIds: ids })} maxHeight={150} />
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>The athletes ticked here can watch it.</p>
        </div>
      )}
      {v.accessMode === 'select_athletes' && (
        <div style={{ marginBottom: 8 }}>
          <AthletePicker students={students} studentName={studentName} selected={v.viewerIds} onChange={ids => set({ ...v, viewerIds: ids })} maxHeight={150} />
        </div>
      )}
    </>
  )

  return (
    <div>
      {!form ? (
        <button className="btn btn-primary" style={{ fontSize: 15, padding: '10px 18px', marginBottom: 14 }} onClick={() => setForm({ ...EMPTY, featuredIds: new Set(), viewerIds: new Set() })}>+ Add study video or link</button>
      ) : (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[['video', '🎬 Upload video'], ['link', '🔗 Add link']].map(([k, l]) => (
              <button key={k} type="button" className={form.kind === k ? 'btn btn-primary' : 'btn'} style={{ flex: 1 }} onClick={() => setForm(f => ({ ...f, kind: k }))}>{l}</button>
            ))}
          </div>
          {form.kind === 'video' && form.files.length > 1 ? (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{form.files.length} videos: each becomes its own study item, titled from its filename (rename any of them afterwards with ✏️).</p>
          ) : <div className="field"><label>Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Southpaw jab counters" style={{ fontSize: 16, padding: '10px 12px' }} />
          </div>}
          {form.kind === 'link' ? (
            <div className="field"><label>Link</label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="Paste a YouTube / web link" inputMode="url" style={{ fontSize: 16, padding: '10px 12px' }} />
            </div>
          ) : (
            <div className="field"><label>Video</label>
              <input type="file" accept="video/*" multiple id="study-file" style={{ display: 'none' }}
                onChange={e => { const files = [...(e.target.files || [])]; if (files.length) setForm(f => ({ ...f, files, title: f.title || (files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') : '') })) }} />
              <label htmlFor="study-file" className="btn" style={{ display: 'block', textAlign: 'center', padding: 14, borderRadius: 10, border: '2px dashed var(--border)', cursor: 'pointer' }}>
                {form.files.length === 1 ? `🎞️ ${form.files[0].name} — tap to change` : form.files.length > 1 ? `🎞️ ${form.files.length} videos chosen — tap to change` : '🎞️ Choose video(s)'}
              </label>
            </div>
          )}
          <div className="field"><label>Notes (optional)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ minHeight: 50 }} />
          </div>
          {sharing(form, setForm)}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setForm(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={add}>{saving ? (form.kind === 'link' ? 'Saving…' : 'Preparing…') : form.kind === 'link' ? 'Add link' : form.files.length > 1 ? `⬆️ Upload ${form.files.length} videos` : '⬆️ Upload'}</button>
          </div>
        </div>
      )}

      {studyFootage.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No study videos or links yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {studyFootage.map(item => {
            const inIt = (item.fight_footage_featured || []).map(a => a.student_id)
            return (
              <div key={item.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <button type="button" className="btn" onClick={() => open(item)} style={{ width: item.thumb ? 80 : 44, height: 44, padding: 0, justifyContent: 'center', fontSize: 18, flexShrink: 0, overflow: 'hidden', position: 'relative' }} title={item.link_url ? 'Open link' : 'Play'}>
                    {item.thumb && <img src={item.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <span style={{ position: 'relative', textShadow: '0 1px 3px #000' }}>{item.link_url ? '🔗' : '▶'}</span>
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                    {item.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{item.description}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {item.link_url ? '🔗 Link' : '🎬 Video'} · 👁 {item.access_mode === 'featured' ? `Athletes in it${inIt.length ? `: ${names(inIt)}` : ' (none ticked)'}` : footageAccessLabel(item)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" className="btn btn-sm" title="Rename" onClick={() => rename(item)}>✏️</button>
                    <button type="button" className="btn btn-sm" onClick={() => editingId === item.id ? setEditingId(null) : startEdit(item)}>{editingId === item.id ? 'Close' : 'Share'}</button>
                    <button type="button" className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={() => remove(item)}>Delete</button>
                  </div>
                </div>
                {editingId === item.id && edit && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    {sharing(edit, setEdit)}
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => saveEdit(item)}>Save</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {playing && (
        <FightFootagePlayer videoUrl={playing.url} title={playing.item.title} footageId={playing.item.id} storagePath={playing.item.storage_path} isCoach
          rotation={playing.item.rotation} onRotationSaved={() => load()} onClose={() => setPlaying(null)} />
      )}
    </div>
  )
}
