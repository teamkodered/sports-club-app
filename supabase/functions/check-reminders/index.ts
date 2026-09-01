// Runs every 30 minutes via pg_cron (same scheduling pattern as
// check-ladder-changes). For each enabled reminder rule whose active
// hour-window includes right now, checks every athlete against that
// rule's condition and sends a push notification the first time it's
// met that day -- reminder_sent_log stops the same nudge firing twice
// in one day even though this check itself runs every 30 minutes.

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const FUNCTIONS_URL = Deno.env.get('SUPABASE_URL')!.replace('.supabase.co', '.functions.supabase.co')

function toEntries(val: any) {
  if (Array.isArray(val)) return val
  if (val && typeof val === 'object' && Object.keys(val).length > 0) return [val]
  return []
}

// Ported from AthleteApp.jsx's isWellbeingQComplete -- kept in sync
// manually since this runs server-side in a different file/language.
function isWellbeingQComplete(key: string, w: any) {
  if (!w) return false
  const q = w[key]
  if (!q) return false
  if (key === 'sleep') return !!(q.hours || q.efficiency)
  if (key === 'nutrition') return !!(q.targetPreset || q.quality)
  if (key === 'hydration') return (q.total || 0) > 0
  if (key === 'outdoors') return (q.totalMinutes || 0) > 0
  if (key === 'talk') return (q.count || 0) > 0
  if (key === 'screenFree') return !!(q.hours || q.custom)
  if (key === 'journal') return (q.count || 0) > 0 || !!q.privateJournal
  if (key === 'creative') return (q.count || 0) > 0
  if (key === 'productivity') return (q.count || 0) > 0
  return false
}

// Ported from AthleteApp.jsx's isMentalityQComplete.
function isMentalityQComplete(key: string, m: any) {
  if (!m) return false
  const q = m[key]
  if (!q) return false
  if (key === 'meditation' || key === 'visualisation' || key === 'activeRecovery') return (q.entries || []).length > 0
  if (key === 'coachability') return Object.keys(q).length > 0
  return (q.count || 0) > 0
}

// Whole-section "was anything logged today" check -- matches
// SECTION_FIELD_CHECK in AthleteApp.jsx.
function sectionHasActivity(sectionKey: string, s: any) {
  if (sectionKey === 'physical') return toEntries(s.running).length > 0 || toEntries(s.watt_bike).length > 0 || toEntries(s.bodyweight).length > 0 || !!s.stretch_flows || !!s.snc || !!s.other_session
  if (sectionKey === 'technique') return toEntries(s.techniques).length > 0
  if (sectionKey === 'tactical') return toEntries(s.tactical).length > 0
  if (sectionKey === 'test') return !!(s.test && Object.values(s.test).some(v => v !== '' && v != null))
  return false
}

// How many "sessions" count as done today for a section -- only
// meaningful for the array-based sections (technique/tactical are the
// clean examples; physical sums all its sub-arrays).
function sectionCountToday(sectionKey: string, s: any) {
  if (sectionKey === 'technique') return toEntries(s.techniques).length
  if (sectionKey === 'tactical') return toEntries(s.tactical).length
  if (sectionKey === 'physical') return toEntries(s.running).length + toEntries(s.watt_bike).length + toEntries(s.bodyweight).length
  return 0
}

function renderTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}

Deno.serve(async () => {
  try {
    const now = new Date()
    const currentHour = now.getUTCHours()
    const today = now.toISOString().split('T')[0]

    const { data: rules, error: rulesError } = await supabase.from('reminder_rules').select('*').eq('enabled', true)
    if (rulesError) return new Response(JSON.stringify({ error: rulesError.message }), { status: 500 })

    const activeRules = (rules || []).filter(r => {
      // Handles windows that don't cross midnight (the normal case)
      // and ones that do (e.g. active_from 22, active_until 2).
      if (r.active_from_hour <= r.active_until_hour) return currentHour >= r.active_from_hour && currentHour <= r.active_until_hour
      return currentHour >= r.active_from_hour || currentHour <= r.active_until_hour
    })

    if (activeRules.length === 0) return new Response(JSON.stringify({ checked_rules: 0, sent: 0 }), { status: 200 })

    const { data: students } = await supabase.from('students').select('id, member_id')
    const memberByStudent: Record<string, string> = Object.fromEntries((students || []).map(s => [s.id, s.member_id]))

    const { data: todaysSessions } = await supabase.from('fit2fight_sessions').select('*').eq('session_date', today)
    const sessionByStudent: Record<string, any> = Object.fromEntries((todaysSessions || []).map(s => [s.student_id, s]))

    let sentCount = 0

    for (const rule of activeRules) {
      for (const studentId of Object.keys(memberByStudent)) {
        const memberId = memberByStudent[studentId]
        if (!memberId) continue

        // How many times has this rule already fired for this athlete
        // today, and how long ago was the most recent one? Both gate
        // whether another send is allowed right now.
        const { data: sentToday } = await supabase.from('reminder_sent_log').select('sent_at').eq('rule_id', rule.id).eq('student_id', studentId).eq('sent_date', today).order('sent_at', { ascending: false })
        const sendsToday = sentToday?.length || 0
        if (sendsToday >= (rule.max_per_day ?? 1)) continue
        if (sendsToday > 0) {
          const hoursSinceLast = (now.getTime() - new Date(sentToday[0].sent_at).getTime()) / 1000 / 60 / 60
          if (hoursSinceLast < (rule.min_hours_between_sends ?? 4)) continue
        }

        const session = sessionByStudent[studentId] || {}
        let shouldSend = false
        let vars: Record<string, string | number> = { section: rule.section_key, question: rule.question_key || '' }

        if (rule.rule_type === 'section_target_remaining' && rule.daily_target) {
          const done = sectionCountToday(rule.section_key, session)
          const remaining = Math.max(0, rule.daily_target - done)
          if (remaining > 0 && remaining <= (rule.remind_when_remaining_at_or_below ?? 999)) {
            shouldSend = true
            vars.remaining = remaining
          }
        } else if (rule.rule_type === 'unlogged_question') {
          const logged = rule.question_key
            ? (rule.section_key === 'wellbeing' ? isWellbeingQComplete(rule.question_key, session.wellbeing) : isMentalityQComplete(rule.question_key, session.mentality_log))
            : sectionHasActivity(rule.section_key, session)
          if (!logged) shouldSend = true
        }

        if (!shouldSend) continue

        // Pick a different variant than whatever was sent last time
        // today, when there's more than one to choose from, so a
        // second nudge doesn't read as an identical repeat.
        const variants: string[] = rule.message_templates?.length ? rule.message_templates : ['Reminder']
        const message = variants.length > 1 && sendsToday > 0
          ? variants[sendsToday % variants.length]
          : variants[Math.floor(Math.random() * variants.length)]

        await fetch(`${FUNCTIONS_URL}/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({
            member_id: memberId,
            title: rule.name,
            body: renderTemplate(message, vars),
            url: '/athlete-app?tab=fit2fight',
          }),
        })
        await supabase.from('reminder_sent_log').insert({ rule_id: rule.id, student_id: studentId, sent_date: today })
        sentCount++
      }
    }

    return new Response(JSON.stringify({ checked_rules: activeRules.length, sent: sentCount }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
