// Computes the current individual league standings (same date range
// logic as the League page -- league_date_from setting through today
// live), compares each student's rank to what it was last time this
// ran, and sends a push notification to anyone who moved up or down.
//
// Not triggered by a database event (recomputing every student's rank
// on every single point award would be wasteful) -- meant to be
// called on a schedule instead, e.g. every 30 minutes via pg_cron. See
// the setup instructions for how to schedule it.

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const FUNCTIONS_URL = Deno.env.get('SUPABASE_URL')!.replace('.supabase.co', '.functions.supabase.co')

Deno.serve(async () => {
  try {
    const { data: settings } = await supabase.from('settings').select('key,value').in('key', ['league_date_from'])
    const dateFrom = settings?.find(s => s.key === 'league_date_from')?.value
      || new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().split('T')[0]

    const { data: pointsLog, error: plError } = await supabase
      .from('points_log')
      .select('student_id, points_awarded')
      .gte('awarded_at', dateFrom)
    if (plError) return new Response(JSON.stringify({ error: plError.message }), { status: 500 })

    const totals = {}
    for (const row of pointsLog || []) {
      totals[row.student_id] = (totals[row.student_id] || 0) + (row.points_awarded || 0)
    }
    const ranked = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([student_id], i) => ({ student_id, rank: i + 1 }))

    const { data: previous } = await supabase.from('league_rank_tracking').select('student_id, last_rank')
    const previousByStudent = Object.fromEntries((previous || []).map(r => [r.student_id, r.last_rank]))

    const { data: students } = await supabase.from('students').select('id, member_id')
    const memberByStudent = Object.fromEntries((students || []).map(s => [s.id, s.member_id]))

    let notified = 0
    for (const { student_id, rank } of ranked) {
      const prevRank = previousByStudent[student_id]
      if (prevRank != null && prevRank !== rank) {
        const movedUp = rank < prevRank
        const memberId = memberByStudent[student_id]
        if (memberId) {
          await fetch(`${FUNCTIONS_URL}/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({
              member_id: memberId,
              title: movedUp ? '📈 You moved up the ladder!' : '📉 Ladder update',
              body: movedUp
                ? `You're now ranked #${rank} in the individual league (was #${prevRank}).`
                : `You're now ranked #${rank} in the individual league (was #${prevRank}).`,
              url: '/athlete-app?tab=league',
            }),
          })
          notified++
        }
      }
      await supabase.from('league_rank_tracking').upsert({ student_id, last_rank: rank, updated_at: new Date().toISOString() })
    }

    return new Response(JSON.stringify({ checked: ranked.length, notified }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
