import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { EVENT_TYPES, FOOTAGE_ACCESS_MODES, footageAccessLabel } from '../lib/mediaConstants.js'
import { saveFootageAthletes } from '../lib/fightFootageTags.js'
import AthletePicker from '../components/shared/AthletePicker.jsx'
import FightFootagePlayer from '../components/shared/FightFootagePlayer.jsx'

// The browse/watch list for the shared fight_footage library --
// upload forms and search/filter controls now live in the separate
// Uploads tab (see Media.jsx, which owns and passes down all of the
// state below); this page just displays whatever that filtering
// currently resolves to, plus per-item access control, delete, and the
// actual player.
export default function ViewIt({ visibleFootage, footage, events, students, studentName, load }) {
  const [playingUrl, setPlayingUrl] = useState(null)
  const [playingTitle, setPlayingTitle] = useState('')
  const [playingItem, setPlayingItem] = useState(null)
  const [editingAccessId, setEditingAccessId] = useState(null)
  const [editAccessMode, setEditAccessMode] = useState('coach_only')
  const [editFeaturedIds, setEditFeaturedIds] = useState(() => new Set())
  const [editViewerIds, setEditViewerIds] = useState(() => new Set())
  const [collapsedEvents, setCollapsedEvents] = useState(() => new Set())

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
    setEditFeaturedIds(new Set((item.fight_footage_featured || []).map(a => a.student_id)))
    setEditViewerIds(new Set((item.fight_footage_athletes || []).map(a => a.student_id)))
  }

  async function saveEditAccess(item) {
    const { error } = await supabase.from('fight_footage').update({ access_mode: editAccessMode }).eq('id', item.id)
    if (error) { alert('Could not save: ' + error.message); return }
    try {
      await saveFootageAthletes(item.id, { accessMode: editAccessMode, featuredIds: editFeaturedIds, viewerIds: editViewerIds })
    } catch (err) { alert('Could not save athletes: ' + err.message); return }
    setEditingAccessId(null)
    load()
  }

  async function deleteFootage(item) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    await supabase.from('fight_footage').delete().eq('id', item.id)
    load()
  }

  // Group by event, newest event first; clips with no event go last.
  const studentById = Object.fromEntries(students.map(s => [s.id, s]))
  const groups = []
  const byKey = {}
  for (const item of visibleFootage) {
    const key = item.event_id || 'none'
    if (!byKey[key]) {
      byKey[key] = { key, event: item.events || null, items: [] }
      groups.push(byKey[key])
    }
    byKey[key].items.push(item)
  }
  groups.sort((a, b) => {
    if (!a.event) return 1
    if (!b.event) return -1
    return (b.event.event_date || '').localeCompare(a.event.event_date || '')
  })

  function toggleGroup(key) {
    setCollapsedEvents(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return (
    <div>
      {visibleFootage.length === 0 ? (
        <div className="empty-state"><h3>No footage yet</h3><p>{footage.length > 0 ? 'Nothing matches the filters set in the Uploads tab' : 'Upload your first clip in the Uploads tab to get started'}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(group => {
            const athleteIds = new Set(group.items.flatMap(i => (i.fight_footage_featured || []).map(a => a.student_id)))
            const collapsed = collapsedEvents.has(group.key)
            return (
          <section key={group.key}>
            <div onClick={() => toggleGroup(group.key)} style={{ cursor: 'pointer', marginBottom: 8, userSelect: 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {collapsed ? '▸' : '▾'} {group.event ? `🏆 ${group.event.name}` : 'No event'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {group.event?.event_date && <>{new Date(group.event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · </>}
                {group.event?.event_type && <>{EVENT_TYPES.find(t => t.value === group.event.event_type)?.label} · </>}
                {group.items.length} video{group.items.length === 1 ? '' : 's'}
                {athleteIds.size > 0 && <> · {[...athleteIds].map(id => studentById[id]).filter(Boolean).map(studentName).join(', ')}</>}
              </div>
            </div>
            {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {group.items.map(item => (
            <div key={item.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openFootage(item)}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>▶️ {item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {new Date(item.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {item.footage_folders?.name && <> · 📁 {item.footage_folders.name}</>}
                    {' · '}👁 {footageAccessLabel(item)}
                  </div>
                  {(item.fight_footage_featured || []).length > 0 && (
                    <div style={{ fontSize: 12, marginTop: 3 }}>
                      🥊 {(item.fight_footage_featured || []).map(a => studentById[a.student_id]).filter(Boolean).map(studentName).join(', ')}
                    </div>
                  )}
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
                  <button className="btn btn-sm" onClick={() => startEditAccess(item)}>Athletes &amp; access</button>
                  <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={() => deleteFootage(item)}>Delete</button>
                </div>
              </div>

              {editingAccessId === item.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Athletes in this fight</label>
                  <div style={{ marginBottom: 12 }}>
                    <AthletePicker students={students} studentName={studentName} selected={editFeaturedIds} onChange={setEditFeaturedIds} maxHeight={130} />
                  </div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Who can see this?</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    {FOOTAGE_ACCESS_MODES.map(m => (
                      <button key={m.value} className={editAccessMode === m.value ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setEditAccessMode(m.value)}>{m.label}</button>
                    ))}
                  </div>
                  {editAccessMode === 'select_athletes' && (
                    <div style={{ marginBottom: 10 }}>
                      <AthletePicker students={students} studentName={studentName} selected={editViewerIds} onChange={setEditViewerIds} />
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
          </section>
            )
          })}
        </div>
      )}

      {playingUrl && (
        <FightFootagePlayer videoUrl={playingUrl} title={playingTitle} footageId={playingItem?.id} storagePath={playingItem?.storage_path} isCoach
          onClose={() => { setPlayingUrl(null); setPlayingTitle(''); setPlayingItem(null) }} />
      )}
    </div>
  )
}
