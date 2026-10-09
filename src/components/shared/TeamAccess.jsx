import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { PAGES, REGISTER_TYPE_OPTIONS, ROLE_OPTIONS, TEAMS, roleDefault, groupId, groupName } from '../../lib/access.js'

// Settings -> Team.
// Tap a person -> pick a role; for Coach or Leader also pick the team (KR / KRBA / PKA).
// That puts them in a GROUP ("KRBA Coach"). The group holds the page + register
// settings, so changing the group later updates everyone in it. Anyone can instead
// be set to "Custom" (their own settings, just for them).
const emptyAccess = () => ({ pages: {}, registers: { types: null, classes: null } })
const cloneAccess = a => ({ pages: { ...(a?.pages || {}) }, registers: { types: a?.registers?.types || null, classes: a?.registers?.classes || null } })

export default function TeamAccess() {
  const [members, setMembers] = useState([])
  const [classes, setClasses] = useState([])
  const [groups, setGroups] = useState([])       // [{ id, role, team, access }]
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)   // { member, role, team|'custom'|null, access (group's or custom draft) }
  const [saving, setSaving] = useState(false)

  async function load() {
    const [{ data: ms }, { data: cs }, { data: gr }] = await Promise.all([
      supabase.from('members').select('id, first_name, last_name, email, role, access').order('first_name'),
      supabase.from('classes').select('id, name, day_of_week, start_time').eq('active', true).order('day_of_week').order('start_time'),
      supabase.from('settings').select('value').eq('key', 'access_groups').maybeSingle(),
    ])
    setMembers(ms || []); setClasses(cs || []); setGroups(Array.isArray(gr?.value) ? gr.value : [])
  }
  useEffect(() => { load() }, [])

  const normRole = r => (r === 'coach' ? 'captain' : (r || 'member'))   // head_coach stays head_coach
  const groupOf = m => groups.find(g => g.id === m.access?.group)
  const label = m => {
    const g = groupOf(m)
    if (g) return groupName(g)
    return ROLE_OPTIONS.find(o => o.key === normRole(m.role))?.label || 'Member'
  }
  const isTeam = m => normRole(m.role) !== 'member' || !!m.access?.group || Object.keys(m.access?.pages || {}).length > 0
  const q = search.trim().toLowerCase()
  const shown = members.filter(m => q ? `${m.first_name} ${m.last_name} ${m.email || ''}`.toLowerCase().includes(q) : isTeam(m))
  const countIn = gid => members.filter(m => m.access?.group === gid).length

  function open(m) {
    const role = normRole(m.role)
    const g = groupOf(m)
    setEditing({ member: m, role, team: g ? g.team : (m.access && Object.keys(m.access).length ? 'custom' : null), access: cloneAccess(g ? g.access : m.access) })
  }
  const pickRole = role => setEditing(e => {
    const team = (role === 'captain' || role === 'leader') ? (e.team && e.team !== 'custom' ? e.team : null) : (e.team === 'custom' ? 'custom' : null)
    const g = team && team !== 'custom' ? groups.find(x => x.id === groupId(role, team)) : null
    return { ...e, role, team, access: g ? cloneAccess(g.access) : e.access }
  })
  const pickTeam = team => setEditing(e => {
    const g = team !== 'custom' ? groups.find(x => x.id === groupId(e.role, team)) : null
    return { ...e, team, access: g ? cloneAccess(g.access) : e.access }
  })

  const setPage = (key, v) => setEditing(e => ({ ...e, access: { ...e.access, pages: { ...e.access.pages, [key]: v } } }))
  const levelFor = key => editing.access.pages[key] ?? roleDefault(editing.role, key)
  const inGroup = editing && editing.team && editing.team !== 'custom' && (editing.role === 'captain' || editing.role === 'leader')
  const gid = inGroup ? groupId(editing.role, editing.team) : null

  async function save() {
    setSaving(true)
    const pages = Object.fromEntries(Object.entries(editing.access.pages).filter(([k, v]) => v !== roleDefault(editing.role, k)))
    const settingsAccess = { pages, registers: editing.access.registers }
    let memberAccess
    if (inGroup) {
      // save the GROUP's settings (applies to everyone in it), then put this person in it
      const nextGroups = [...groups.filter(g => g.id !== gid), { id: gid, role: editing.role, team: editing.team, access: settingsAccess }]
      const { error: gErr } = await supabase.from('settings').upsert({ key: 'access_groups', value: nextGroups }, { onConflict: 'key' })
      if (gErr) { setSaving(false); return alert('Could not save the group: ' + gErr.message) }
      setGroups(nextGroups)
      memberAccess = { group: gid }
    } else if (editing.role === 'admin' || editing.role === 'member') {
      memberAccess = editing.team === 'custom' && editing.role === 'member' && (Object.keys(pages).length || settingsAccess.registers.types || settingsAccess.registers.classes) ? settingsAccess : null
    } else {
      memberAccess = (Object.keys(pages).length || settingsAccess.registers.types || settingsAccess.registers.classes) ? settingsAccess : null
    }
    const { error } = await supabase.from('members').update({ role: editing.role, access: memberAccess }).eq('id', editing.member.id)
    setSaving(false)
    if (error) return alert('Could not save access: ' + error.message)
    setMembers(prev => prev.map(m => m.id === editing.member.id ? { ...m, role: editing.role, access: memberAccess } : m))
    setEditing(null)
  }

  const registersEditor = () => {
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
        <span>REGISTERS {everything ? '(all)' : `(${curClassIds.length + curTypes.length} of ${classes.length + otherTypes.length})`}</span>
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
        {otherTypes.map(t => <label key={t.key}><input type="checkbox" checked={typeOn(t.key)} onChange={() => toggleType(t.key)} />{t.label}</label>)}
      </div>
    </>
  }

  return (
    <div className="card team-access" style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Tap someone to set their role. Coaches and Leaders go in a team group (KR / KRBA / PKA) — change a group once and everyone in it updates.
      </p>
      {groups.length > 0 && (
        <div className="team-groups">
          {groups.slice().sort((a, b) => groupName(a).localeCompare(groupName(b))).map(g => (
            <span key={g.id} className="team-group-chip">{groupName(g)} <b>{countIn(g.id)}</b></span>
          ))}
        </div>
      )}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search anyone by name or email to add them…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 8 }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map(m => (
          <button key={m.id} type="button" onClick={() => open(m)} className="team-row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, textAlign: 'left' }}>
              <b style={{ fontSize: 14 }}>{m.first_name} {m.last_name}</b>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</span>
            </span>
            <span className={`team-role team-role-${normRole(m.role)}`}>{label(m)}</span>
          </button>
        ))}
        {shown.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>{q ? 'No one matches' : 'No team members yet'}</p>}
      </div>

      {editing && (
        <div className="team-sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="team-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Access for ${editing.member.first_name} ${editing.member.last_name}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div><b style={{ fontSize: 17 }}>{editing.member.first_name} {editing.member.last_name}</b><div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{editing.member.email}</div></div>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            </div>

            <div className="team-label">ROLE</div>
            <div className="team-seg">
              {ROLE_OPTIONS.map(r => <button key={r.key} type="button" className={editing.role === r.key ? 'on' : ''} onClick={() => pickRole(r.key)}>{r.label}</button>)}
            </div>

            {editing.role === 'head_coach' && (
              <div className="team-group-note">Head Coach: tick their classes under Registers. They'll only see those classes' registers and those students (with contact details), enforced by the database.</div>
            )}
            {(editing.role === 'captain' || editing.role === 'leader') && <>
              <div className="team-label">TEAM</div>
              <div className="team-seg">
                {TEAMS.map(t => <button key={t} type="button" className={editing.team === t ? 'on' : ''} onClick={() => pickTeam(t)}>{t}</button>)}
                <button type="button" className={editing.team === 'custom' ? 'on' : ''} onClick={() => pickTeam('custom')}>Custom</button>
              </div>
            </>}

            {inGroup && (
              <div className="team-group-note">
                <b>{editing.team} {editing.role === 'leader' ? 'Leader' : 'Coach'}</b> group settings
                {groups.some(g => g.id === gid)
                  ? <> — changes here apply to everyone in this group ({countIn(gid) + (editing.member.access?.group === gid ? 0 : 1)} {countIn(gid) + (editing.member.access?.group === gid ? 0 : 1) === 1 ? 'person' : 'people'}).</>
                  : <> — new group: set it up once and reuse it for anyone else.</>}
              </div>
            )}
            {(editing.role === 'captain' || editing.role === 'leader') && !editing.team && (
              <div className="team-group-note">Pick a team to use its group settings, or Custom for settings just for this person.</div>
            )}
            {editing.role === 'admin' && <div className="team-group-note">Admins have full access to everything.</div>}

            {editing.role !== 'admin' && editing.role !== 'member' && (editing.team || editing.role === 'head_coach') && <>
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
              {levelFor('registers') !== 'none' && registersEditor()}
            </>}

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {editing.role !== 'admin' && editing.team && <button type="button" className="btn" onClick={() => setEditing(e => ({ ...e, access: emptyAccess() }))}>Reset to role defaults</button>}
              <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={saving || ((editing.role === 'captain' || editing.role === 'leader') && !editing.team) || (editing.role === 'head_coach' && !editing.access.registers.classes?.length)} onClick={save}>
                {saving ? 'Saving…' : inGroup ? `Save — ${editing.team} ${editing.role === 'leader' ? 'Leader' : 'Coach'}` : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
