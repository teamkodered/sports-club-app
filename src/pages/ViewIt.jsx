import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { EVENT_TYPES } from '../lib/mediaConstants.js'
import FightFootagePlayer from '../components/shared/FightFootagePlayer.jsx'

// The browse/watch list for the shared fight_footage library --
// upload forms and search/filter controls now live in the separate
// Uploads tab (see Media.jsx, which owns and passes down all of the
// state below); this page just displays whatever that filtering
// currently resolves to, plus per-item access control, delete, and the
// actual player.
export default function ViewIt({ visibleFootage, footage, students, studentName, load }) {
  const [playingUrl, setPlayingUrl] = useState(null)
  const [playingTitle, setPlayingTitle] = useState('')
  const [playingItem, setPlayingItem] = useState(null)
  const [editingAccessId, setEditingAccessId] = useState(null)
  const [editAccessMode, setEditAccessMode] = useState('coach_only')
  const [editStudentIds, setEditStudentIds] = useState(() => new Set())
  const [editStudentSearch, setEditStudentSearch] = useState('')

  async function openFootage(item) {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ mode: 'read', footage_id: item.id }),
    })
    const data = await res.json()
    if (data.error) { alert('Could not open this video: ' + data.error); return }
    setPlayingUrl(data.url)
    setPlayingTitle(item.title)
    setPlayingItem(item)
  }

  function startEditAccess(item) {
    setEditingAccessId(item.id)
    setEditAccessMode(item.access_mode)
    setEditStudentIds(new Set((item.fight_footage_athletes || []).map(a => a.student_id)))
    setEditStudentSearch('')
  }

  async function saveEditAccess(item) {
    await supabase.from('fight_footage').update({ access_mode: editAccessMode }).eq('id', item.id)
    // Simplest correct approach: replace the whole tagged-athletes set
    // rather than trying to diff it, since this is a small, infrequent
    // admin action, not a hot path worth optimising.
    await supabase.from('fight_footage_athletes').delete().eq('footage_id', item.id)
    if (editAccessMode === 'select_athletes' && editStudentIds.size > 0) {
      await supabase.from('fight_footage_athletes').insert([...editStudentIds].map(student_id => ({ footage_id: item.id, student_id })))
    }
    setEditingAccessId(null)
    load()
  }

  async function deleteFootage(item) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    await supabase.from('fight_footage').delete().eq('id', item.id)
    load()
  }

  return (
    <div>
      {visibleFootage.length === 0 ? (
        <div className="empty-state"><h3>No footage yet</h3><p>{footage.length > 0 ? 'Nothing matches the filters set in the Uploads tab' : 'Upload your first clip in the Uploads tab to get started'}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleFootage.map(item => (
            <div key={item.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openFootage(item)}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>▶️ {item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {new Date(item.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {item.events?.name && <> · 🏆 {item.events.name}{item.events.event_type ? ` (${EVENT_TYPES.find(t => t.value === item.events.event_type)?.label})` : ''}</>}
                    {' · '}{item.access_mode === 'all' ? 'Whole team' : item.access_mode === 'coach_only' ? 'Coach only' : `${item.fight_footage_athletes?.length || 0} athlete${item.fight_footage_athletes?.length === 1 ? '' : 's'}`}
                  </div>
                  {item.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{item.description}</div>}
                  {(item.tags?.length > 0 || item.grade_tag) && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {item.grade_tag && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#8B5CF622', color: '#8B5CF6' }}>🥋 {item.grade_tag}</span>}
                      {(item.tags || []).map(t => (
                        <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => startEditAccess(item)}>Who can see this?</button>
                  <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={() => deleteFootage(item)}>Delete</button>
                </div>
              </div>

              {editingAccessId === item.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <button className={editAccessMode === 'coach_only' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setEditAccessMode('coach_only')}>Coach only</button>
                    <button className={editAccessMode === 'select_athletes' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setEditAccessMode('select_athletes')}>Specific athletes</button>
                    <button className={editAccessMode === 'all' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setEditAccessMode('all')}>Whole team</button>
                  </div>
                  {editAccessMode === 'select_athletes' && (
                    <div style={{ marginBottom: 10 }}>
                      <input type="text" placeholder="🔍 Search by name…" value={editStudentSearch} onChange={e => setEditStudentSearch(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 8 }} />
                      <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                        {students.filter(s => !editStudentSearch.trim() || studentName(s).toLowerCase().includes(editStudentSearch.trim().toLowerCase())).map(s => (
                          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 8px' }}>
                            <input type="checkbox" checked={editStudentIds.has(s.id)} onChange={e => setEditStudentIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(s.id); else next.delete(s.id)
                              return next
                            })} />
                            {studentName(s)}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => saveEditAccess(item)}>Save</button>
                    <button className="btn btn-sm" onClick={() => setEditingAccessId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {playingUrl && (
        <FightFootagePlayer videoUrl={playingUrl} title={playingTitle} footageId={playingItem?.id} storagePath={playingItem?.storage_path} isCoach
          onClose={() => { setPlayingUrl(null); setPlayingTitle(''); setPlayingItem(null) }} />
      )}
    </div>
  )
}
