import { supabase } from '../../lib/supabase.js'

// Notes list helpers (Oct 2026): title (first line) in bold + slightly larger,
// and a tick to mark a note done (green). Done state is athlete_notes_log.completed_at.
export function NoteText({ text }) {
  const t = (text || '').trim()
  const nl = t.indexOf('\n')
  const title = nl >= 0 ? t.slice(0, nl) : t
  const rest = nl >= 0 ? t.slice(nl + 1).trim() : ''
  return (
    <>
      <p style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35, margin: 0, whiteSpace: 'pre-line' }}>{title}</p>
      {rest && <p style={{ fontSize: 13, lineHeight: 1.5, margin: '4px 0 0', whiteSpace: 'pre-line', color: 'var(--text-secondary)' }}>{rest}</p>}
    </>
  )
}

export function DoneTick({ note, onChange }) {
  const done = !!note.completed_at
  return (
    <button type="button" title={done ? 'Done -- tap to mark not done' : 'Mark as done'} aria-pressed={done}
      onClick={async e => {
        e.stopPropagation()
        const completed_at = done ? null : new Date().toISOString()
        const { error } = await supabase.from('athlete_notes_log').update({ completed_at }).eq('id', note.id)
        if (error) { alert(/completed_at/.test(error.message) ? 'Ticking notes off needs a quick database update (supabase_notes_completed.sql).' : 'Could not update the note: ' + error.message); return }
        onChange({ ...note, completed_at })
      }}
      style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: `2px solid ${done ? '#1D9E75' : 'var(--border-strong)'}`, background: done ? '#1D9E75' : 'transparent', color: '#fff', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
      {done ? '✓' : ''}
    </button>
  )
}

export const doneCardStyle = note => note.completed_at ? { borderLeft: '4px solid #1D9E75', background: 'rgba(29,158,117,0.08)' } : {}
export const isCompletedPdp = n => (n.note_text || '').startsWith('Completed PDP task')
