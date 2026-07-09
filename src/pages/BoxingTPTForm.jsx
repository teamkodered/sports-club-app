import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

const BOXING_GROUPS = [
  { label: '🥊 Technical', colour: '#E24B4A', keys: [
    ['shapes','Shape(s)'], ['punch_quality','Punch quality'], ['footwork','Footwork'],
    ['defence','Defence'], ['counters','Counters'], ['attack','Attack'],
    ['combinations','Combinations'], ['change_of_tempo','Change of tempo'],
    ['use_of_phases','Use of phases'], ['distance','Distance'], ['flow','Flow'], ['self_expression','Self expression'],
  ]},
  { label: '⚡ Speed', colour: '#EF9F27', keys: [
    ['foot_speed','Foot speed'], ['limb_speed','Limb speed'],
    ['combination_speed','Combination speed'], ['reaction','Reaction'],
  ]},
  { label: '💪 Physical', colour: '#1D9E75', keys: [
    ['punching_power','Punching power'], ['strength_upper','Strength upper'],
    ['strength_lower','Strength lower'], ['stability_core','Stability core'],
    ['agility','Agility'], ['stop_n_go','Stop & go'],
    ['stamina_aerobic','Stamina aerobic'], ['stamina_anaerobic','Stamina anaerobic'],
    ['suppleness_upper','Suppleness upper'], ['suppleness_lower','Suppleness lower'],
    ['recovery','Recovery'], ['health','Health'],
  ]},
  { label: '🧠 Tactical', colour: '#8B5CF6', keys: [
    ['read_opponent','Read opponent'], ['tempo_rhythm','Tempo / rhythm'],
    ['tactical_intelligence','Tactical intelligence'], ['ring_awareness','Ring awareness'],
    ['know_strengths_weaknesses','Know S&W'], ['heart_grit','Heart / grit'],
    ['concentration','Concentration'], ['timing','Timing'],
  ]},
]

const ALL_KEYS = BOXING_GROUPS.flatMap(g => g.keys.map(([k]) => k))

export default function BoxingTPTForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const studentId = searchParams.get('student_id')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [student, setStudent] = useState(null)
  const [scores, setScores] = useState(Object.fromEntries(ALL_KEYS.map(k => [k, ''])))
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    if (studentId) {
      supabase.from('students').select('*, members(first_name, last_name)')
        .eq('id', studentId).limit(1)
        .then(({ data }) => setStudent(data?.[0] || null))
    } else if (profile) {
      supabase.from('students').select('*, members(first_name, last_name)')
        .eq('member_id', profile.id).limit(1)
        .then(({ data }) => setStudent(data?.[0] || null))
    }
  }, [studentId, profile])

  async function save() {
    if (!student) return alert('No student linked')
    setSaving(true)
    const payload = {
      student_id: student.id,
      first_name: student.members?.first_name,
      last_name: student.members?.last_name,
      assessed_at: date,
      assessed_by: profile?.id,
      notes: notes || null,
      ...Object.fromEntries(ALL_KEYS.map(k => [k, scores[k] ? parseInt(scores[k]) : null]))
    }
    const { error } = await supabase.from('tpt_boxing').insert(payload)
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    setSaved(true)
    setSaving(false)
  }

  const filled = ALL_KEYS.filter(k => scores[k] !== '').length

  if (saved) return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>TPT saved!</h2>
      <p style={{ color: 'var(--text-secondary)' }}>{filled} scores recorded for {student?.members?.first_name}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
        <button className="btn btn-sm" onClick={() => { setSaved(false); setScores(Object.fromEntries(ALL_KEYS.map(k => [k, '']))) }}>New assessment</button>
        <button className="btn btn-primary btn-sm" onClick={() => navigate(-1)}>Done</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🥊 Boxing TPT</h1>
      {student && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {student.members?.first_name} {student.members?.last_name}
      </p>}
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 20 }}>Score each skill 1–10. Leave blank to skip.</p>

      <div className="field" style={{ marginBottom: 16 }}>
        <label>Assessment date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ maxWidth: 200 }} />
      </div>

      {BOXING_GROUPS.map(group => (
        <div key={group.label} className="card" style={{ borderLeft: `3px solid ${group.colour}`, marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: group.colour, marginBottom: 12 }}>{group.label}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {group.keys.map(([k, label]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{label}</label>
                <input type="number" min="1" max="10" value={scores[k]} onChange={e => setScores(s => ({ ...s, [k]: e.target.value }))}
                  style={{ width: 52, padding: '4px 8px', border: `1px solid ${scores[k] ? group.colour + '80' : 'var(--border-strong)'}`,
                    borderRadius: 'var(--radius)', fontSize: 13, textAlign: 'center',
                    background: scores[k] ? group.colour + '15' : 'var(--bg-secondary)', color: 'var(--text)',
                    fontWeight: scores[k] ? 700 : 400 }} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="field"><label>Notes</label>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, resize: 'vertical', background: 'var(--bg-secondary)', color: 'var(--text)' }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex: 1, padding: 14, fontSize: 15 }}>
          {saving ? 'Saving…' : `Save assessment (${filled}/${ALL_KEYS.length} scored)`}
        </button>
      </div>
    </div>
  )
}
