import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import HrrTestTool from './HrrTestTool.jsx'

// ▶ Start activity -> ⏹ Stop activity · start recovery (live stopwatch), then the 1-min HR recovery straight away.
// Used on the Physical cards (Running, Watt bike, Bodyweight) and the Fixed load circuit test.
export default function ActivityTimer({ label = 'activity', afterTest, studentId, studentName, onStop, onRecovery, mode = 'self' }) {
  const [start, setStart] = useState(null), [now, setNow] = useState(0), [hrr, setHrr] = useState(false), [last, setLast] = useState(null)
  useEffect(() => { if (!start) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [start])
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const secs = start ? Math.floor((now - start) / 1000) : 0
  const btn = { width: '100%', justifyContent: 'center', flexDirection: 'column', padding: '10px 12px', margin: '8px 0', fontWeight: 800, fontStyle: 'italic' }
  return (
    <>
      {start ? (
        <button type="button" className="btn" style={{ ...btn, borderColor: '#E24B4A', color: '#FF6B6B' }} onClick={() => {
          const s = Math.max(1, Math.round((Date.now() - start) / 1000)); setStart(null); setLast(s); onStop?.(s); if (afterTest) setHrr(true)
        }}>⏹ STOP ACTIVITY · START RECOVERY<small style={{ fontSize: 13, fontStyle: 'normal' }}>⏱ {fmt(secs)}</small></button>
      ) : (
        <button type="button" className="btn" style={{ ...btn, borderColor: '#1D9E75', color: '#22B14C' }} onClick={() => { setStart(Date.now()); setNow(Date.now()) }}>
          ▶ START ACTIVITY<small style={{ fontSize: 11, fontStyle: 'normal', opacity: 0.75, fontWeight: 500 }}>{last ? `last: ${fmt(last)} · ` : ''}times your {label}, then 1-min HR recovery</small>
        </button>
      )}
      {hrr && createPortal(
        <HrrTestTool zIndex={700} variant="recovery" afterTest={afterTest} mode={mode} studentId={studentId} studentName={studentName}
          onClose={() => setHrr(false)} onResult={r => onRecovery?.(r)} />, document.body)}
    </>
  )
}
