import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { PAGES, REGISTER_TYPE_OPTIONS, ROLE_OPTIONS, roleDefault } from '../../lib/access.js'

// Settings -> Team: everyone with a staff role or custom access, plus search to
// add anyone else. Tap a person to set their role, what they can do on each
// page (No access / View / Full), and which registers and classes they can take.
export default function TeamAccess() {
  const [members, setMembers] = useState([])
  const [classes, setClasses] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)   // member being edited (draft copy)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [{ data: ms }, { data: cs }] = await Promise.all([
      supabase.from('members').select('id, first_name, last_name, email, role, access').order('first_name'),
      supabase.from('classes').select('id, name, day_of_week, start_time').eq('active', true).order('day_of_week').order('start_time'),
    ])
    setMembers(ms || []); setClasses(cs || [])
  }
  useEffect(() => { load() }, [])

  const isTeam = m => (m.role && m.role !== 'member') || Object.keys(m.access?.pages || {}).length > 0
  const q = search.trim().toLowerCase()
  const shown = members.filter(m => q ? `${m.first_name} ${m.last_name} ${m.email || ''}`.toLowerCase().includes(q) : isTeam(m))
  const roleLabel = r => ROLE_OPTIONS.find(o => o.key === (r === 'coach' ? 'captain' : r))?.label || 'Member'

  const summary = m => {
    if (m.role === 'admin') return 'Full access'
    const pages = PAGES.map(p => [p, m.access?.pages?.[p.key] ?? roleDefault(m.role, p.key)]).filter(([, v]) => v !== 'none')
    if (!pages.length) return 'No staff access'
    return pages.map(([p, v]) => `${p.label}${v === 'view' ? ' (view)' : ''}`).join(' · ')
  }

  function open(m) {
    setEditing({ ...m, access: { pages: { ...(m.access?.pages || {}) }, registers: { types: m.access?.registers?.types || null, classes: m.access?.registers?.classes || null } } })
  }
  const setPage = (key, v) => setEditing(e => ({ ...e, access: { ...e.access, pages: { ...e.access.pages, [key]: v } } }))
  const levelFor = key => editing.access.pages[key] ?? roleDefault(editing.role, key)
  const toggleIn = (field, id, all) => setEditing(e => {
    const cur = e.access.registers[field] || all
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
    return { ...e, access: { ...e.access, registers: { ...e.access.registers, [field]: next.length === all.length ? null : next } } }
  })

  async function save() {
    setSaving(true)
    // only keep page levels that differ from the role's defaults
    const pages = Object.fromEntries(Object.entries(editing.access.pages).filter(([k, v]) => v !== roleDefault(editing.role, k)))
    const registers = { types: editing.access.registers.types, classes: editing.access.registers.classes }
    const access = (Object.keys(pages).length || registers.types || registers.classes) ? { pages, registers } : null
    const { error } = await supabase.from('members').update({ role: editing.role, access }).eq('id', editing.id)
    setSaving(false)
    if (error) return alert('Could not save access: ' + error.message)
    setMembers(prev => prev.map(m => m.id === editing.id ? { ...m, role: editing.role, access } : m))
    setEditing(null)
  }

  const allTypes = REGISTER_TYPE_OPTIONS.map(t => t.key)
  const allClassIds = classes.map(c => c.id)

  return (
    <div className="card team-access" style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Your team and what each person can do. Tap someone to change their role, page access and registers. Search to give anyone else access.
      </p>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search anyone by name or email to add them…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 8 }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map(m => (
          <button key={m.id} type="button" onClick={() => open(m)} className="team-row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, textAlign: 'left' }}>
              <b style={{ fontSize: 14 }}>{m.first_name} {m.last_name}</b>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary(m)}</span>
            </span>
            <span className={`team-role team-role-${m.role || 'member'}`}>{roleLabel(m.role)}</span>
          </button>
        ))}
        {shown.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>{q ? 'No one matches' : 'No team members yet'}</p>}
      </div>

      {editing && (
        <div className="team-sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="team-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Access for ${editing.first_name} ${editing.last_name}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div><b style={{ fontSize: 17 }}>{editing.first_name} {editing.last_name}</b><div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{editing.email}</div></div>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            </div>

            <div className="team-label">ROLE</div>
            <div className="team-seg">
              {ROLE_OPTIONS.map(r => (
                <button key={r.key} type="button" className={(editing.role === r.key || (r.key === 'captain' && editing.role === 'coach')) ? 'on' : ''}
                  onClick={() => setEditing(e => ({ ...e, role: r.key }))} title={r.hint}>{r.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ROLE_OPTIONS.find(r => r.key === editing.role)?.hint} — the role sets the defaults below; change any page to override.</div>

            {editing.role !== 'admin' && <>
              <div className="team-label">PAGES</div>
              <div className="team-pages">
                {PAGES.map(p => {
                  const v = levelFor(p.key)
                  return (
                    <div key={p.key} className="team-page-row">
                      <span>{p.label}</span>
                      <div className="team-seg small">
                        {[['none', 'None'], ['view', 'View'], ['edit', 'Full']].map(([k, l]) => (
                          <button key={k} type="button" className={v === k ? `on lvl-${k}` : ''} onClick={() => setPage(p.key, k)}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {levelFor('registers') !== 'none' && (() => {
                // One tick-list of individual registers: every class on its own, then the athlete / group registers.
                // Stored as registers.classes (class ids) + registers.types ('class' is added automatically when any class is ticked).
                const regs = editing.access.registers
                const otherTypes = REGISTER_TYPE_OPTIONS.filter(t => t.key !== 'class')
                const classOn = id => !regs.classes ? (!regs.types || regs.types.includes('class')) : regs.classes.includes(id)
                const typeOn = k => !regs.types || regs.types.includes(k)
                const everything = !regs.types && !regs.classes
                const apply = (classIds, typeKeys) => {
                  const allC = classIds.length === classes.length, allT = otherTypes.every(t => typeKeys.includes(t.key))
                  const types = (allC && allT) ? null : [...(classIds.length ? ['class'] : []), ...typeKeys]
                  setEditing(e => ({ ...e, access: { ...e.access, registers: { types, classes: allC ? null : classIds } } }))
                }
                const curClassIds = classes.filter(c => classOn(c.id)).map(c => c.id)
                const curTypes = otherTypes.filter(t => typeOn(t.key)).map(t => t.key)
                const toggleClass = id => apply(curClassIds.includes(id) ? curClassIds.filter(x => x !== id) : [...curClassIds, id], curTypes)
                const toggleType = k => apply(curClassIds, curTypes.includes(k) ? curTypes.filter(x => x !== k) : [...curTypes, k])
                return <>
                  <div className="team-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>REGISTERS THEY CAN TAKE {everything ? '(all)' : `(${curClassIds.length + curTypes.length} of ${classes.length + otherTypes.length})`}</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-sm" onClick={() => apply(classes.map(c => c.id), otherTypes.map(t => t.key))}>All</button>
                      <button type="button" className="btn btn-sm" onClick={() => apply([], [])}>None</button>
                    </span>
                  </div>
                  <div className="team-checks">
                    {classes.map(c => (
                      <label key={c.id}><input type="checkbox" checked={classOn(c.id)} onChange={() => toggleClass(c.id)} />
                        <b style={{ fontWeight: 600 }}>{c.day_of_week} {c.start_time?.slice(0, 5)}</b> <span style={{ color: 'var(--text-secondary)' }}>{c.name}</span></label>
                    ))}
                    <div className="team-label" style={{ marginTop: 4 }}>ATHLETE &amp; GROUP REGISTERS</div>
                    {otherTypes.map(t => (
                      <label key={t.key}><input type="checkbox" checked={typeOn(t.key)} onChange={() => toggleType(t.key)} />{t.label}</label>
                    ))}
                  </div>
                </>
              })()}
            </>}

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="button" className="btn" onClick={() => setEditing(e => ({ ...e, access: { pages: {}, registers: { types: null, classes: null } } }))}>Reset to role defaults</button>
              <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save access'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
