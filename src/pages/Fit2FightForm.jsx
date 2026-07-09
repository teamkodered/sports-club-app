import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

export default function Fit2FightForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const studentId = searchParams.get('student_id')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [student, setStudent] = useState(null)

  const [form, setForm] = useState({
    session_date: new Date().toISOString().split('T')[0],
    weight_before: '', weight_after: '',
    height_cm: '', reach_cm: '',
    notes: '',
    heart_rate: { avg_bpm: '', peak_bpm: '' },
    running: { type: '', sets: [] },
    bodyweight: { type: '', sets: [] },
    techniques: { type: '', sets: [] },
  })

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

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function save() {
    if (!student) return alert('No student linked to this account')
    setSaving(true)
    const payload = {
      student_id: student.id,
      first_name: student.members?.first_name,
      last_name: student.members?.last_name,
      session_date: form.session_date,
      weight_before: form.weight_before ? parseFloat(form.weight_before) : null,
      weight_after: form.weight_after ? parseFloat(form.weight_after) : null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      reach_cm: form.reach_cm ? parseFloat(form.reach_cm) : null,
      notes: form.notes || null,
      heart_rate: (form.heart_rate.avg_bpm || form.heart_rate.peak_bpm) ? form.heart_rate : null,
      running: form.running.type ? form.running : null,
      bodyweight: form.bodyweight.type ? form.bodyweight : null,
      techniques: form.techniques.type ? form.techniques : null,
      logged_by: profile?.id,
    }
    const { error } = await supabase.from('fit2fight_sessions').insert(payload)
    if (error) { alert('Error saving: ' + error.message); setSaving(false); return }
    setSaved(true)
    setSaving(false)
  }

  const weight_change = form.weight_before && form.weight_after
    ? (parseFloat(form.weight_after) - parseFloat(form.weight_before)).toFixed(1) : null

  if (saved) return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Session saved!</h2>
      {weight_change && <p style={{ color: parseFloat(weight_change) < 0 ? '#1d9e75' : '#a32d2d', fontWeight: 600 }}>
        Weight change: {weight_change > 0 ? '+' : ''}{weight_change}kg
      </p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
        <button className="btn btn-sm" onClick={() => { setSaved(false); setForm(f => ({ ...f, weight_before: '', weight_after: '', notes: '' })) }}>Log another</button>
        <button className="btn btn-primary btn-sm" onClick={() => navigate(-1)}>Done</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 540, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>💪 Fit II Fight</h1>
      {student && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        {student.members?.first_name} {student.members?.last_name}
      </p>}

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Session details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>Date</label><input type="date" value={form.session_date} onChange={set('session_date')} /></div>
          <div className="field"><label>Weight before (kg)</label><input type="number" step="0.1" value={form.weight_before} onChange={set('weight_before')} placeholder="e.g. 65.0" /></div>
          <div className="field"><label>Weight after (kg)</label><input type="number" step="0.1" value={form.weight_after} onChange={set('weight_after')} placeholder="e.g. 63.5" /></div>
          {weight_change && <div className="field"><label>Change</label>
            <div style={{ padding: '8px 10px', fontWeight: 700, color: parseFloat(weight_change) < 0 ? '#1d9e75' : '#a32d2d' }}>
              {weight_change > 0 ? '+' : ''}{weight_change}kg
            </div>
          </div>}
          <div className="field"><label>Height (cm)</label><input type="number" step="0.1" value={form.height_cm} onChange={set('height_cm')} /></div>
          <div className="field"><label>Reach (cm)</label><input type="number" step="0.1" value={form.reach_cm} onChange={set('reach_cm')} /></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>❤️ Heart rate</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>Avg BPM</label><input type="number" value={form.heart_rate.avg_bpm} onChange={e => setForm(f => ({ ...f, heart_rate: { ...f.heart_rate, avg_bpm: e.target.value } }))} /></div>
          <div className="field"><label>Peak BPM</label><input type="number" value={form.heart_rate.peak_bpm} onChange={e => setForm(f => ({ ...f, heart_rate: { ...f.heart_rate, peak_bpm: e.target.value } }))} /></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>🏃 Running</h3>
        <div className="field"><label>Type / activity</label>
          <input value={form.running.type} onChange={e => setForm(f => ({ ...f, running: { ...f.running, type: e.target.value } }))} placeholder="e.g. Interval circuit, 20min run" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>💪 Bodyweight exercises</h3>
        <div className="field"><label>Activity</label>
          <input value={form.bodyweight.type} onChange={e => setForm(f => ({ ...f, bodyweight: { ...f.bodyweight, type: e.target.value } }))} placeholder="e.g. Push ups, squats" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>🥋 Techniques</h3>
        <div className="field"><label>Activity</label>
          <input value={form.techniques.type} onChange={e => setForm(f => ({ ...f, techniques: { ...f.techniques, type: e.target.value } }))} placeholder="e.g. Pad work, bag work" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="field"><label>📝 Notes</label>
          <textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="Any notes about today's session…"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, resize: 'vertical', background: 'var(--bg-secondary)', color: 'var(--text)' }} />
        </div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%', padding: 14, fontSize: 15 }}>
        {saving ? 'Saving…' : 'Save session'}
      </button>
    </div>
  )
}
