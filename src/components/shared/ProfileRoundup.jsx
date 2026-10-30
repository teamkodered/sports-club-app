import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { TEST_CATEGORIES, bestByTest, lowerIsBetter } from '../../lib/testResults.js'
import { useSectionLeague } from '../../lib/sectionLeague.jsx'

// Profile round-up (athlete app + coach view, under the profile when the name card is opened):
// heart rate vs team, league places, best times, top scores, attendance, record, weight, PDP + focus.
const iso = d => d.toISOString().split('T')[0]
const UNIT = Object.fromEntries(TEST_CATEGORIES.flatMap(c => c.tests.map(t => [t.name, t.unit])))
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th')
const fmtTime = v => v >= 60 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : `${Math.round(v * 10) / 10}s`

export default function ProfileRoundup({ student, sessions = [], pdpNotes = {}, attendance = [], maxHr = 190, onOpen }) {
  const sid = student?.id
  const league = useSectionLeague(sid)
  const [hr, setHr] = useState(null)       // { me, team }
  const [pdpDone, setPdpDone] = useState(null)
  const [allTimes, setAllTimes] = useState(false), [allScores, setAllScores] = useState(false)

  useEffect(() => {
    if (!sid) return
    let stop = false
    const from = new Date(); from.setDate(from.getDate() - 56)
    ;(async () => {
      const [{ data: w }, { data: h }, { data: t }] = await Promise.all([
        supabase.from('wearable_workouts').select('start_time, avg_heart_rate').eq('student_id', sid).gte('start_time', from.toISOString()),
        supabase.from('hr_sessions').select('session_date, avg_hr').eq('student_id', sid).gte('session_date', iso(from)),
        supabase.rpc('team_workrate_daily', { p_from: iso(from) }),
      ])
      const days = {}
      for (const r of w || []) if (r.avg_heart_rate) (days[iso(new Date(r.start_time))] ||= []).push(r.avg_heart_rate)
      for (const r of h || []) if (r.avg_hr) (days[r.session_date] ||= []).push(r.avg_hr)
      const mine = Object.entries(days).map(([d, v]) => [d, v.reduce((a, b) => a + b, 0) / v.length * 100 / maxHr])
      const team = Object.fromEntries((t || []).map(r => [r.day, Number(r.avg_pct)]))
      const same = mine.filter(([d]) => team[d] != null)
      if (!stop) setHr(mine.length ? { me: mine.reduce((a, [, v]) => a + v, 0) / mine.length, team: same.length ? same.reduce((a, [d]) => a + team[d], 0) / same.length : null, meSame: same.length ? same.reduce((a, [, v]) => a + v, 0) / same.length : null } : null)
      // PDP actions done this month (net of undone)
      const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0)
      const { data: p } = await supabase.from('points_log').select('point_type').eq('student_id', sid).gte('awarded_at', m0.toISOString()).or('point_type.like.PDP action%,point_type.like.PDP task completed%')
      if (!stop) setPdpDone((p || []).reduce((n, r) => n + (r.point_type.startsWith('PDP action undone') ? -1 : 1), 0))
    })().catch(() => {})
    return () => { stop = true }
  }, [sid, maxHr])

  const pbs = useMemo(() => bestByTest(sessions || []), [sessions])
  const hrrList = useMemo(() => (sessions || []).filter(s => s.test?.['Heart Rate Recovery (1 min)'] != null).sort((a, b) => String(b.session_date).localeCompare(String(a.session_date))), [sessions])
  const times = Object.entries(pbs).filter(([k]) => lowerIsBetter(k) && !/^HRR /.test(k))
  const scores = Object.entries(pbs).filter(([k]) => !lowerIsBetter(k) && !/^HRR |Heart Rate Recovery|Anaerobic/.test(k))
  const weights = (sessions || []).map(s => ({ d: s.session_date, w: parseFloat(s.weight_after ?? s.weight_before) })).filter(x => !isNaN(x.w)).sort((a, b) => String(a.d).localeCompare(String(b.d))).slice(-4)
  const since = new Date(); since.setDate(since.getDate() - 28)
  const att4 = (attendance || []).filter(a => a.session_date >= iso(since) && (a.attended || a.status === 'present' || a.attended_at)).length
  const month = new Date().toISOString().slice(0, 7)
  const focus = Object.values((pdpNotes?.__focus || {})[month] || {})
  const rec = { w: student?.wins || 0, l: student?.losses || 0, d: student?.draws || 0 }
  const fights = rec.w + rec.l + rec.d
  const SECT = [['mentality', 'Mental', '#22B14C'], ['tactical', 'Tact.', '#FF2A2A'], ['technical', 'Tech.', '#2F6BFF'], ['physical', 'Phys.', '#E6B800'], ['foundation', 'Found.', '#C93BFF']]
  const anyLeague = SECT.some(([k]) => league[k]?.rank)

  const Tile = ({ icon, title, children, wide, go }) => (
    <div className={`kc-ru-tile${wide ? ' wide' : ''}${go ? ' tap' : ''}`} onClick={go ? () => onOpen?.(go) : undefined}>
      <div className="kc-ru-title">{icon} {title}</div>{children}
    </div>
  )
  const list = (rows, all, fmt) => (all ? rows : rows.slice(0, 3)).map(([k, v]) => <div key={k} className="kc-ru-line"><span>{k.replace(/ \(.*\)$/, '')}</span><b>{fmt(k, v)}</b></div>)
  return (
    <div className="kc-ru">
      <div className="kc-ru-head">Round-up</div>
      <div className="kc-ru-grid">
        {hr && (
          <Tile icon="❤️" title="Heart rate vs team · 8 weeks" wide go="whoop">
            <div className="kc-ru-big"><b>{Math.round(hr.me)}%</b>{hr.team != null && <span>team {Math.round(hr.team)}%</span>}
              {hr.team != null && <em style={{ color: hr.meSame - hr.team >= 0 ? '#1D9E75' : '#E24B4A' }}>{hr.meSame - hr.team >= 0 ? '+' : ''}{Math.round(hr.meSame - hr.team)}% vs team</em>}</div>
            {hrrList.length > 0 && <div className="kc-ru-sub">HR recovery {hrrList[0].test['Heart Rate Recovery (1 min)']} bpm{hrrList[1] ? ` · ${hrrList[0].test['Heart Rate Recovery (1 min)'] - hrrList[1].test['Heart Rate Recovery (1 min)'] >= 0 ? 'up' : 'down'} ${Math.abs(hrrList[0].test['Heart Rate Recovery (1 min)'] - hrrList[1].test['Heart Rate Recovery (1 min)'])} since last test` : ''}</div>}
          </Tile>
        )}
        {!hr && hrrList.length > 0 && <Tile icon="❤️" title="HR recovery" wide><div className="kc-ru-big"><b>{hrrList[0].test['Heart Rate Recovery (1 min)']} bpm</b></div></Tile>}
        {anyLeague && (
          <Tile icon="🏆" title="League places" wide go="leagues">
            <div className="kc-ru-places">{SECT.map(([k, l, c]) => <div key={k}><b style={{ color: c }}>{league[k]?.rank ? ord(league[k].rank) : '–'}</b><span>{l}</span></div>)}</div>
          </Tile>
        )}
        {times.length > 0 && (
          <Tile icon="⏱" title="Best times">
            {list(times, allTimes, (k, v) => UNIT[k] === 'sec' ? fmtTime(v) : `${v}${UNIT[k] ? ' ' + UNIT[k] : ''}`)}
            {times.length > 3 && <button type="button" className="kc-ru-more" onClick={e => { e.stopPropagation(); setAllTimes(v => !v) }}>{allTimes ? 'Show less' : `See all ${times.length}`}</button>}
          </Tile>
        )}
        {scores.length > 0 && (
          <Tile icon="⭐" title="Top scores">
            {list(scores, allScores, (k, v) => `${v}${UNIT[k] && UNIT[k] !== 'level' ? ' ' + UNIT[k] : ''}`)}
            {scores.length > 3 && <button type="button" className="kc-ru-more" onClick={e => { e.stopPropagation(); setAllScores(v => !v) }}>{allScores ? 'Show less' : `See all ${scores.length}`}</button>}
          </Tile>
        )}
        {(attendance || []).length > 0 && <Tile icon="📅" title="Attendance" go="sessions"><div className="kc-ru-big"><b>{att4}</b></div><div className="kc-ru-sub">sessions in the last 4 weeks</div></Tile>}
        {fights > 0 && <Tile icon="🥊" title="Fight record"><div className="kc-ru-big"><b>{rec.w}W {rec.l}L {rec.d}D</b></div><div className="kc-ru-sub">{Math.round(rec.w * 100 / fights)}% wins</div></Tile>}
        {weights.length > 0 && <Tile icon="⚖️" title="Weight"><div className="kc-ru-big"><b>{weights[weights.length - 1].w}kg</b></div>
          {weights.length > 1 && <div className="kc-ru-sub">{weights[weights.length - 1].w - weights[0].w > 0 ? 'up' : 'down'} {Math.abs(Math.round((weights[weights.length - 1].w - weights[0].w) * 10) / 10)}kg over {weights.length} weigh-ins</div>}</Tile>}
        {(pdpDone || focus.length > 0) ? <Tile icon="🎯" title="PDP and focus" go="pdp"><div className="kc-ru-big"><b>{Math.max(0, pdpDone || 0)} done</b></div><div className="kc-ru-sub">this month{focus.length ? ` · focus: ${focus.join(', ')}` : ''}</div></Tile> : null}
      </div>
    </div>
  )
}
