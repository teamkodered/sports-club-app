// KR FIGHT 2 -- saved progress: gems and fighter upgrades.
// Uses the krfight_* database functions (supabase_krfight_progress.sql). Until that SQL has been run --
// or for staff, who have no athlete record -- progress is kept on the device instead, so the game works
// either way. Gems: training entries per pillar + house points (wild) + gems won in the game.
import { supabase } from '../../../lib/supabase.js'

export const PILLARS = ['physical', 'technical', 'tactical', 'mentality', 'foundation']
// Upgrade areas = the club's MTP analysis (Technical / Physical / Mental), each with its own effect in a
// fight. Every area has 5 levels. eff(lv) returns what the area adds to the fighter's modifiers.
export const AREA_GROUPS = ['Technical', 'Physical', 'Mental']
export const AREAS = [
  // Technical
  { key: 'shapes', g: 'Technical', name: 'Shapes', what: 'Tighter guard: less damage through blocks' },
  { key: 'punch_quality', g: 'Technical', name: 'Punch quality', what: '+3% punch damage per level' },
  { key: 'footwork', g: 'Technical', name: 'Footwork', what: '+3% stepping-in speed per level' },
  { key: 'defence', g: 'Technical', name: 'Defence', what: '-2.5% damage taken per level' },
  { key: 'counters', g: 'Technical', name: 'Counters', what: '+6% damage when punishing a missed move' },
  { key: 'attack', g: 'Technical', name: 'Attack', what: '+6% damage on the opening strike' },
  { key: 'combinations', g: 'Technical', name: 'Combinations', what: '+5% combo damage per level' },
  { key: 'change_of_tempo', g: 'Technical', name: 'Change of tempo', what: 'More time to land combo inputs' },
  { key: 'use_of_phases', g: 'Technical', name: 'Use of phases', what: '+6% special-move damage per level' },
  { key: 'distance', g: 'Technical', name: 'Distance', what: '+2% reach on every strike' },
  { key: 'flow', g: 'Technical', name: 'Flow', what: '-4% recovery after strikes' },
  { key: 'self_expression', g: 'Technical', name: 'Self expression', what: '+6% super damage per level' },
  // Physical
  { key: 'foot_speed', g: 'Physical', name: 'Foot speed', what: '+5% backing-off speed per level' },
  { key: 'limb_speed', g: 'Physical', name: 'Limb speed', what: 'Strikes come out 4% faster' },
  { key: 'combination_speed', g: 'Physical', name: 'Combination speed', what: 'Chain into the next strike sooner' },
  { key: 'reaction', g: 'Physical', name: 'Reaction', what: '-5% time stunned when hit' },
  { key: 'punching_power', g: 'Physical', name: 'Punching power', what: '+6% heavy-punch damage per level' },
  { key: 'strength_upper', g: 'Physical', name: 'Strength upper', what: '+6% knock-back on hits' },
  { key: 'strength_lower', g: 'Physical', name: 'Strength lower', what: '+3% kick damage per level' },
  { key: 'stability_core', g: 'Physical', name: 'Core stability', what: '-7% knock-back taken' },
  { key: 'agility', g: 'Physical', name: 'Agility', what: '+4% jump height and distance' },
  { key: 'stop_n_go', g: 'Physical', name: 'Stop & go', what: '-5% recovery after kicks' },
  { key: 'stamina_aerobic', g: 'Physical', name: 'Stamina aerobic', what: '+4 health per level' },
  { key: 'stamina_anaerobic', g: 'Physical', name: 'Stamina anaerobic', what: '+6% super meter gain' },
  { key: 'suppleness_upper', g: 'Physical', name: 'Suppleness upper', what: '+3% punch reach per level' },
  { key: 'suppleness_lower', g: 'Physical', name: 'Suppleness lower', what: '+3% kick reach per level' },
  { key: 'recovery', g: 'Physical', name: 'Recovery', what: 'Recover faster while tagged out' },
  { key: 'health', g: 'Physical', name: 'Health', what: 'Slowly regain health when not hit' },
  // Mental
  { key: 'read_opponent', g: 'Mental', name: 'Read opponent', what: '-8% damage from specials' },
  { key: 'tempo_rhythm', g: 'Mental', name: 'Tempo / rhythm', what: '-6% special cool-down per level' },
  { key: 'tactical_intelligence', g: 'Mental', name: 'Tactical intelligence', what: '-10% tag cool-down per level' },
  { key: 'ring_awareness', g: 'Mental', name: 'Ring awareness', what: '-8% damage when on the ropes' },
  { key: 'know_strengths_weaknesses', g: 'Mental', name: 'Know S&W', what: '+4% damage on long-hold strikes' },
  { key: 'heart_grit', g: 'Mental', name: 'Heart / grit', what: '+8% damage when low on health' },
  { key: 'concentration', g: 'Mental', name: 'Concentration', what: '+5% stun on your hits' },
  { key: 'timing', g: 'Mental', name: 'Timing', what: '+7% damage hitting them as they start' },
]
export const AREA_KEYS = AREAS.map(a => a.key)
export const MAX_LV = 5
export const DAILY_GEMS = 60
export const costOf = lv => 3 + 2 * lv // next level from lv (3, 5, 7, 9, 11)
const LS = 'krfight-progress'

const blank = () => ({ mode: 'local', training: {}, house_points: 0, game_gems: {}, spent: {}, upgrades: {}, gems_today: 0, gems_day: null })
const n = v => Math.max(0, Math.floor(Number(v) || 0))

function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(LS) || 'null')
    if (v) {
      // the first version had 5 broad areas; those purchases are refunded
      const old = Object.values(v.upgrades || {}).some(u => Object.keys(u || {}).some(k => !AREA_KEYS.includes(k)))
      if (old) { v.upgrades = {}; v.spent = {} }
      return { ...blank(), ...v, mode: 'local' }
    }
  } catch (e) { /* ignore */ }
  return blank()
}
function writeLocal(p) { try { localStorage.setItem(LS, JSON.stringify({ game_gems: p.game_gems, spent: p.spent, upgrades: p.upgrades, gems_today: p.gems_today, gems_day: p.gems_day })) } catch (e) { /* ignore */ } }
const today = () => new Date().toISOString().slice(0, 10)

// load once when the game opens
export async function loadProgress() {
  try {
    const { data, error } = await supabase.rpc('krfight_profile')
    if (!error && data) return { ...blank(), ...data, mode: 'db' }
  } catch (e) { /* not set up yet / offline */ }
  return readLocal()
}

export const levelOf = (p, pillar, area) => n(p?.upgrades?.[pillar]?.[area])
export const fighterLevel = (p, pillar) => AREAS.reduce((a, x) => a + levelOf(p, pillar, x.key), 0)
export function available(p, pillar) { return n(p.training?.[pillar]) + n(p.game_gems?.[pillar]) - n(p.spent?.[pillar]) }
export function wild(p) { return n(p.house_points) - n(p.spent?.wild) }

// can this upgrade be bought? returns { cost, fromColour, fromWild } or null
export function priceFor(p, pillar, area) {
  const lv = levelOf(p, pillar, area)
  if (lv >= MAX_LV) return null
  const cost = costOf(lv), fromColour = Math.min(cost, Math.max(0, available(p, pillar))), fromWild = cost - fromColour
  if (fromWild > Math.max(0, wild(p))) return null
  return { cost, fromColour, fromWild }
}

// buy one level; returns the new progress (or throws if the server refuses)
export async function buyUpgrade(p, pillar, area) {
  const price = priceFor(p, pillar, area)
  if (!price) throw new Error('Not enough gems')
  const upgrades = { ...p.upgrades, [pillar]: { ...(p.upgrades?.[pillar] || {}), [area]: levelOf(p, pillar, area) + 1 } }
  const spent = { ...p.spent, [pillar]: n(p.spent?.[pillar]) + price.fromColour, wild: n(p.spent?.wild) + price.fromWild }
  if (p.mode === 'db') {
    const { data, error } = await supabase.rpc('krfight_spend', { p_upgrades: upgrades, p_spent: spent })
    if (error) throw new Error(error.message)
    return { ...blank(), ...data, mode: 'db' }
  }
  const next = { ...p, upgrades, spent }
  writeLocal(next)
  return next
}

// gems for a finished match: each fighter in the team earns their colour (more for harder levels / wins)
export function matchGems(teamKeys, won, level) {
  const per = won ? ({ easy: 2, medium: 3, hard: 5 }[level] || 3) : 1
  const g = {}
  for (const k of teamKeys) g[k] = (g[k] || 0) + per
  return g
}

// add won gems (60 a day cap); returns { progress, given }
export async function awardGems(p, gems) {
  if (p.mode === 'db') {
    try {
      const before = p.game_gems || {}
      const { data, error } = await supabase.rpc('krfight_award', { p_gems: gems })
      if (!error && data) {
        const after = data.game_gems || {}, given = {}
        for (const k of PILLARS) { const d = n(after[k]) - n(before[k]); if (d > 0) given[k] = d }
        return { progress: { ...blank(), ...data, mode: 'db' }, given }
      }
    } catch (e) { /* fall through: nothing given */ }
    return { progress: p, given: {} }
  }
  const t = today(), used = p.gems_day === t ? n(p.gems_today) : 0
  let room = Math.max(0, DAILY_GEMS - used)
  const game_gems = { ...p.game_gems }, given = {}
  for (const [k, v] of Object.entries(gems)) {
    const give = Math.min(n(v), room)
    if (give > 0) { game_gems[k] = n(game_gems[k]) + give; given[k] = give; room -= give }
  }
  const next = { ...p, game_gems, gems_today: DAILY_GEMS - room, gems_day: t }
  writeLocal(next)
  return { progress: next, given }
}

// all the fight modifiers, neutral values
export const BASE_MODS = { punchDmg: 1, kickDmg: 1, heavyPunch: 1, heavyHold: 1, dmgTaken: 1, blockChip: 1, counters: 1, opener: 1, comboBonus: 1, comboGap: 0,
  specialDmg: 1, reach: 1, punchReach: 1, kickReach: 1, recovery: 1, kickRecovery: 1, superDmg: 1, walk: 1, backWalk: 1, startup: 1, chainEarly: 0,
  stunTaken: 1, push: 1, knockTaken: 1, jump: 1, maxHp: 100, meterGain: 1, benchRegen: 1, regen: 0, projTaken: 1, specialCd: 1, tagCd: 1,
  cornerTaken: 1, grit: 1, stunGiven: 1, timing: 1 }
export function modsFor(up = {}) {
  const L = k => Math.min(MAX_LV, n(up[k]))
  return {
    ...BASE_MODS,
    blockChip: 1 - 0.12 * L('shapes'), punchDmg: 1 + 0.03 * L('punch_quality'), walk: 1 + 0.03 * L('footwork'), dmgTaken: 1 - 0.025 * L('defence'),
    counters: 1 + 0.06 * L('counters'), opener: 1 + 0.06 * L('attack'), comboBonus: 1 + 0.05 * L('combinations'), comboGap: 3 * L('change_of_tempo'),
    specialDmg: 1 + 0.06 * L('use_of_phases'), reach: 1 + 0.02 * L('distance'), recovery: 1 - 0.04 * L('flow'), superDmg: 1 + 0.06 * L('self_expression'),
    backWalk: 1 + 0.05 * L('foot_speed'), startup: 1 - 0.04 * L('limb_speed'), chainEarly: L('combination_speed'), stunTaken: 1 - 0.05 * L('reaction'),
    heavyPunch: 1 + 0.06 * L('punching_power'), push: 1 + 0.06 * L('strength_upper'), kickDmg: 1 + 0.03 * L('strength_lower'), knockTaken: 1 - 0.07 * L('stability_core'),
    jump: 1 + 0.04 * L('agility'), kickRecovery: 1 - 0.05 * L('stop_n_go'), maxHp: 100 + 4 * L('stamina_aerobic'), meterGain: 1 + 0.06 * L('stamina_anaerobic'),
    punchReach: 1 + 0.03 * L('suppleness_upper'), kickReach: 1 + 0.03 * L('suppleness_lower'), benchRegen: 1 + 0.25 * L('recovery'), regen: 0.004 * L('health'),
    projTaken: 1 - 0.08 * L('read_opponent'), specialCd: 1 - 0.06 * L('tempo_rhythm'), tagCd: 1 - 0.1 * L('tactical_intelligence'), cornerTaken: 1 - 0.08 * L('ring_awareness'),
    heavyHold: 1 + 0.04 * L('know_strengths_weaknesses'), grit: 1 + 0.08 * L('heart_grit'), stunGiven: 1 + 0.05 * L('concentration'), timing: 1 + 0.07 * L('timing'),
  }
}
// a fighter's def with their upgrades applied
export function applyUpgrades(def, up = {}) {
  const mods = modsFor(up)
  return { ...def, mods, maxHp: mods.maxHp, up: { ...up } }
}
// the CPU gets a share of the player's average level in each area so harder levels stay a challenge
export function cpuUpgrades(p, level) {
  const share = { easy: 0.3, medium: 0.6, hard: 1 }[level] ?? 0.6
  const out = {}
  for (const a of AREAS) {
    const avg = PILLARS.reduce((s, k) => s + levelOf(p, k, a.key), 0) / PILLARS.length
    out[a.key] = Math.round(avg * share)
  }
  return out
}
