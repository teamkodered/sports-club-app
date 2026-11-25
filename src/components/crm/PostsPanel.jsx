import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fetchAll } from '../../lib/fetchAll.js'
import { loadPostIdeas, postName, consentOk, BRANDS } from '../../lib/postIdeas.js'
import PostGraphic from './PostGraphic.jsx'
import MediaLibrary from './MediaLibrary.jsx'

// 📸 Admin: post ideas from real club events, a content calendar, and photos coaches send in.
const CHANNELS = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['website', 'Website'], ['tiktok', 'TikTok']]
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '')
const mondayOf = d => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x) }

function copyText(t) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(() => {}, () => prompt('Copy:', t))
  else prompt('Copy:', t)
}

export default function PostsPanel() {
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get('dropbox') ? 'library' : 'ideas')
  const [missingSql, setMissingSql] = useState(false)
  const [days, setDays] = useState(30)
  const [ideas, setIdeas] = useState(null)
  const [showPlanned, setShowPlanned] = useState(false)
  const [posts, setPosts] = useState([])
  const [moments, setMoments] = useState([])
  const [students, setStudents] = useState({})
  const [graphic, setGraphic] = useState(null)
  const [openCap, setOpenCap] = useState(null)
  const [copied, setCopied] = useState('')

  async function loadPosts() {
    const { data, error } = await supabase.from('marketing_posts').select('*').order('post_date', { ascending: true })
    if (error) { setMissingSql(true); return }
    setPosts(data || [])
  }
  async function loadMoments() {
    const { data, error } = await supabase.from('moments').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) return
    const paths = (data || []).map(m => m.photo_path)
    const { data: urls } = paths.length ? await supabase.storage.from('moments').createSignedUrls(paths, 3600) : { data: [] }
    const byPath = Object.fromEntries((urls || []).map(u => [u.path, u.signedUrl]))
    setMoments((data || []).map(m => ({ ...m, url: byPath[m.photo_path] })))
  }
  async function loadIdeas(d = days) {
    setIdeas(null)
    try { setIdeas(await loadPostIdeas(d)) } catch (e) { console.error(e); setIdeas([]) }
  }
  useEffect(() => {
    loadPosts(); loadMoments(); loadIdeas()
    fetchAll(() => supabase.from('students').select('id, media_restriction, members(first_name, last_name, date_of_birth)').order('id'))
      .then(({ data }) => setStudents(Object.fromEntries((data || []).map(s => [s.id, s]))))
  }, [])

  const usableMoments = moments.filter(m => m.consent_ok && m.url)
  const flash = k => { setCopied(k); setTimeout(() => setCopied(''), 1500) }

  // ── calendar actions (all show on screen straight away) ──
  async function planIdea(idea) {
    const row = { title: idea.title, caption: idea.caption, brand: idea.brand, idea_key: idea.key, post_date: iso(new Date()) }
    const { data, error } = await supabase.from('marketing_posts').insert(row).select()
    if (error || !data?.length) return alert('Could not add to the calendar: ' + (error?.message || 'no permission'))
    setPosts(p => [...p, data[0]].sort((a, b) => a.post_date.localeCompare(b.post_date)))
    setIdeas(list => list.map(i => i.key === idea.key ? { ...i, planned: true } : i))
  }
  async function addPost(extra = {}) {
    const { data, error } = await supabase.from('marketing_posts').insert({ title: 'New post', post_date: iso(new Date()), brand: 'KR', ...extra }).select()
    if (error || !data?.length) return alert('Could not add: ' + (error?.message || 'no permission'))
    setPosts(p => [...p, data[0]].sort((a, b) => a.post_date.localeCompare(b.post_date)))
    setView('calendar'); setOpenCap(data[0].id)
  }
  async function updatePost(id, patch) {
    setPosts(p => p.map(x => x.id === id ? { ...x, ...patch } : x))
    const { data, error } = await supabase.from('marketing_posts').update(patch).eq('id', id).select()
    if (error || !data?.length) { alert('Not saved: ' + (error?.message || 'no permission')); loadPosts() }
  }
  async function deletePost(p) {
    if (!confirm(`Delete "${p.title}" from the calendar?`)) return
    setPosts(list => list.filter(x => x.id !== p.id))
    const { error } = await supabase.from('marketing_posts').delete().eq('id', p.id)
    if (error) { alert('Could not delete: ' + error.message); loadPosts() }
    if (p.idea_key) setIdeas(list => list?.map(i => i.key === p.idea_key ? { ...i, planned: false } : i))
  }
  function toggleChannel(p, ch) {
    const channels = p.channels?.includes(ch) ? p.channels.filter(c => c !== ch) : [...(p.channels || []), ch]
    updatePost(p.id, { channels, status: channels.length ? 'posted' : (p.status === 'posted' ? 'planned' : p.status) })
  }
  async function setMomentStatus(m, status) {
    setMoments(list => list.map(x => x.id === m.id ? { ...x, status } : x))
    const { data, error } = await supabase.from('moments').update({ status }).eq('id', m.id).select()
    if (error || !data?.length) { alert('Not saved: ' + (error?.message || 'no permission')); loadMoments() }
  }

  const weeks = useMemo(() => {
    const cutoff = iso(new Date(Date.now() - 28 * 864e5))
    const g = {}
    posts.filter(p => p.post_date >= cutoff).forEach(p => { (g[mondayOf(p.post_date)] ||= []).push(p) })
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b))
  }, [posts])
  const thisMonday = mondayOf(iso(new Date()))

  if (missingSql) return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>📸 Posts</div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Run <b>supabase_marketing_posts.sql</b> in the Supabase SQL editor, then open this tab again.</div>
    </div>
  )

  const newMoments = moments.filter(m => m.status === 'new').length
  const shownIdeas = (ideas || []).filter(i => showPlanned || !i.planned)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', marginRight: 8 }}>📸 Posts</div>
        {[['ideas', '💡 Ideas'], ['calendar', '📅 Calendar'], ['moments', `📷 Moments${newMoments ? ` (${newMoments})` : ''}`], ['library', '📚 Library']].map(([k, l]) => (
          <button key={k} className={`btn btn-sm${view === k ? ' btn-primary' : ''}`} onClick={() => setView(k)}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => setGraphic({})}>🎨 Blank graphic</button>
      </div>

      {view === 'ideas' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
            From the last
            <select value={days} onChange={e => { const d = Number(e.target.value); setDays(d); loadIdeas(d) }} style={{ fontSize: 14 }}>
              <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={showPlanned} onChange={e => setShowPlanned(e.target.checked)} /> Show ones already in the calendar</label>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            Only people with media consent = Yes are included. Under-18s show as first name + initial. Ages, venues and schools are never added.
          </div>
          {ideas === null && <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>Finding things to post…</div>}
          {ideas && shownIdeas.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>Nothing new in this period. Try a longer period, or add your own post in the Calendar.</div>}
          {shownIdeas.map(i => (
            <div key={i.key} className="card" style={{ padding: 14, marginBottom: 10, opacity: i.planned ? 0.55 : 1, borderLeft: `4px solid ${BRANDS[i.brand]?.colour || '#888'}` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{i.icon} {i.title}</div>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{fmt(i.date)}</span>
              </div>
              <div style={{ fontSize: 14, marginTop: 4 }}>{i.people.map(p => p.name).join(', ')}</div>
              {i.hidden > 0 && <div style={{ fontSize: 12, color: '#EF9F27', marginTop: 4 }}>⚠ {i.hidden} left out — no media consent on their record</div>}
              {i.note && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>ℹ {i.note}</div>}
              {openCap === i.key && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: 'var(--bg-secondary)', borderRadius: 8, padding: 10, marginTop: 8 }}>{i.caption}</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                <button className="btn btn-sm" onClick={() => setOpenCap(openCap === i.key ? null : i.key)}>{openCap === i.key ? 'Hide caption' : '📝 Caption'}</button>
                <button className="btn btn-sm" onClick={() => { copyText(i.caption); flash(i.key) }}>{copied === i.key ? '✓ Copied' : 'Copy caption'}</button>
                <button className="btn btn-sm" onClick={() => setGraphic({ brand: i.brand, headline: i.headline, subline: i.subline, names: i.people.map(p => p.name).join('\n'), showNames: i.type !== 'record' })}>🎨 Graphic</button>
                {i.planned ? <span style={{ fontSize: 13, color: '#1D9E75', alignSelf: 'center' }}>✓ In calendar</span>
                  : <button className="btn btn-sm btn-primary" onClick={() => planIdea(i)}>📅 Add to calendar</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'calendar' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-sm btn-primary" onClick={() => addPost()}>+ Add post</button>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>Tick where it's gone out — it then shows as Posted.</span>
          </div>
          {weeks.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>Nothing planned yet. Add ideas from 💡 Ideas, or press + Add post.</div>}
          {weeks.map(([wk, list]) => (
            <div key={wk} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: wk === thisMonday ? '#EC4899' : 'var(--text-secondary)', margin: '4px 0 6px' }}>
                {wk === thisMonday ? 'This week' : `Week of ${fmt(wk)}`}
              </div>
              {list.map(p => (
                <div key={p.id} className="card" style={{ padding: 12, marginBottom: 8, borderLeft: `4px solid ${BRANDS[p.brand]?.colour || '#888'}`, opacity: p.status === 'skipped' ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="date" value={p.post_date} onChange={e => e.target.value && updatePost(p.id, { post_date: e.target.value })} style={{ fontSize: 14 }} />
                    <input value={p.title} onChange={e => setPosts(l => l.map(x => x.id === p.id ? { ...x, title: e.target.value } : x))}
                      onBlur={e => updatePost(p.id, { title: e.target.value.trim() || 'Post' })} style={{ flex: 1, minWidth: 160, fontSize: 15, fontWeight: 600 }} />
                    <span className={`badge ${p.status === 'posted' ? 'badge-green' : p.status === 'skipped' ? 'badge-gray' : 'badge-amber'}`} style={{ fontSize: 11 }}>
                      {p.status === 'posted' ? 'Posted' : p.status === 'skipped' ? 'Skipped' : 'Planned'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {CHANNELS.map(([k, l]) => {
                      const on = p.channels?.includes(k)
                      return <button key={k} className="btn btn-sm" onClick={() => toggleChannel(p, k)}
                        style={{ background: on ? '#1D9E75' : 'transparent', color: on ? '#fff' : 'var(--text)', borderColor: on ? '#1D9E75' : 'var(--border-strong)' }}>{on ? '✓ ' : ''}{l}</button>
                    })}
                  </div>
                  {openCap === p.id && (
                    <textarea rows={6} defaultValue={p.caption || ''} placeholder="Caption…" onBlur={e => updatePost(p.id, { caption: e.target.value })}
                      style={{ width: '100%', fontSize: 14, marginTop: 8, resize: 'vertical' }} />
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <button className="btn btn-sm" onClick={() => setOpenCap(openCap === p.id ? null : p.id)}>{openCap === p.id ? 'Done' : '📝 Caption'}</button>
                    {p.caption && <button className="btn btn-sm" onClick={() => { copyText(p.caption); flash(p.id) }}>{copied === p.id ? '✓ Copied' : 'Copy caption'}</button>}
                    <button className="btn btn-sm" onClick={() => setGraphic({ brand: p.brand || 'KR', headline: p.title, showNames: false })}>🎨 Graphic</button>
                    {p.status !== 'posted' && <button className="btn btn-sm" onClick={() => updatePost(p.id, { status: p.status === 'skipped' ? 'planned' : 'skipped' })}>{p.status === 'skipped' ? 'Un-skip' : 'Skip'}</button>}
                    <button className="btn btn-sm btn-danger" onClick={() => deletePost(p)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {view === 'moments' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            Photos coaches send from the Dashboard. A photo is only usable when everyone tagged in it has media consent = Yes (checked by the database).
          </div>
          {moments.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>No moments yet. Coaches can send photos from their Dashboard (📸 Send a moment).</div>}
          {moments.map(m => {
            const names = (m.student_ids || []).map(id => students[id]).filter(Boolean)
            const missing = names.filter(s => !consentOk(s))
            return (
              <div key={m.id} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', gap: 12, opacity: m.status === 'new' ? 1 : 0.6 }}>
                {m.url ? <img src={m.url} alt="" style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} /> : <div style={{ width: 110, height: 110, background: 'var(--bg-secondary)', borderRadius: 8 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.caption || 'No caption'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    From {m.submitter_name || 'a coach'} · {fmt(m.created_at.slice(0, 10))}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {m.no_one_identifiable && !names.length ? 'No one recognisable' : names.map(s => postName(s)).join(', ') || '—'}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, color: m.consent_ok ? '#1D9E75' : '#E24B4A', fontWeight: 600 }}>
                    {m.consent_ok ? '✓ Media consent OK' : `⚠ Can't be used — ${missing.length ? missing.map(s => postName(s)).join(', ') + ' without consent' : 'consent missing'}`}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {m.consent_ok && m.url && <button className="btn btn-sm" onClick={() => setGraphic({ photo: m.url, headline: m.caption || '', names: names.map(s => postName(s)).join('\n'), showNames: names.length > 0 })}>🎨 Use in graphic</button>}
                    {m.consent_ok && m.url && <a className="btn btn-sm" href={m.url} target="_blank" rel="noreferrer" download>⬇ Photo</a>}
                    {m.consent_ok && <button className="btn btn-sm" onClick={() => { addPost({ title: m.caption || 'Moment', moment_id: m.id }); setMomentStatus(m, 'used') }}>📅 Add to calendar</button>}
                    {m.status === 'new'
                      ? <button className="btn btn-sm" onClick={() => setMomentStatus(m, 'not_used')}>Not using</button>
                      : <button className="btn btn-sm" onClick={() => setMomentStatus(m, 'new')}>Back to new</button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'library' && <MediaLibrary students={students}
        onUseInGraphic={(dataUrl, names) => setGraphic({ photo: dataUrl, names: names.join('\n'), showNames: names.length > 0 })} />}

      {graphic && <PostGraphic initial={graphic} moments={usableMoments} onClose={() => setGraphic(null)} />}
    </div>
  )
}
