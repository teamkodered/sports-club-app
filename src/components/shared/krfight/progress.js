// KR FIGHT 2 -- saved progress: gems and fighter upgrades.
// Uses the krfight_* database functions (supabase_krfight_progress.sql). Until that SQL has been run --
// or for staff, who have no athlete record -- progress is kept on the device instead, so the game works
// either way. Gems: training entries per pillar + house points (wild) + gems won in the game.
import { supabase } from '../../../lib/supabase.js'
import { COMBO_LIB, COMBO_BY_ID, TIER_XP, TIER_GEMS, BRANCHES, seasonOf, CARDS, CARD_BY_ID, CARD_RARITY, CARD_MAX_LV, SKIN_BY_KEY } from './data.js'

export const PILLARS = ['physical', 'technical', 'tactical', 'mentality', 'foundation']
// Upgrade areas: one set per pillar. Technical / Physical follow the club's MTP analysis; Tactical and
// Mentality take the MTP mental areas plus a few of their own; Foundation is the health pillar (from the
// app's wellbeing questions). Every area has 5 levels and its own effect in a fight.
export const AREA_GROUPS = ['Technical', 'Physical', 'Tactical', 'Mentality', 'Foundation']
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
  // Tactical
  { key: 'read_opponent', g: 'Tactical', name: 'Read opponent', what: '-8% damage from specials' },
  { key: 'tempo_rhythm', g: 'Tactical', name: 'Tempo / rhythm', what: '-6% special cool-down per level' },
  { key: 'tactical_intelligence', g: 'Tactical', name: 'Tactical intelligence', what: '-10% tag cool-down per level' },
  { key: 'ring_awareness', g: 'Tactical', name: 'Ring awareness', what: '-8% damage when on the ropes' },
  { key: 'timing', g: 'Tactical', name: 'Timing', what: '+7% damage hitting them as they start' },
  { key: 'game_plan', g: 'Tactical', name: 'Game plan', what: 'Start the fight with +10 super meter' },
  { key: 'pressure', g: 'Tactical', name: 'Pressure', what: '+6% damage when they are on the ropes' },
  { key: 'feints', g: 'Tactical', name: 'Feints', what: 'The opponent blocks 6% less often' },
  // Mentality
  { key: 'know_strengths_weaknesses', g: 'Mentality', name: 'Know S&W', what: '+4% damage on long-hold strikes' },
  { key: 'heart_grit', g: 'Mentality', name: 'Heart / grit', what: '+8% damage when low on health' },
  { key: 'concentration', g: 'Mentality', name: 'Concentration', what: '+5% stun on your hits' },
  { key: 'composure', g: 'Mentality', name: 'Composure', what: '-6% damage taken when low on health' },
  { key: 'confidence', g: 'Mentality', name: 'Confidence', what: '+3% damage while ahead on health' },
  { key: 'resilience', g: 'Mentality', name: 'Resilience', what: 'After a team KO, come in with +10 meter' },
  { key: 'video_analysis', g: 'Mentality', name: 'Video analysis', what: '-6% damage from their combos' },
  { key: 'chess', g: 'Mentality', name: 'Chess', what: '+5% damage from the 3rd hit of a chain' },
  // Foundation (health)
  { key: 'sleep', g: 'Foundation', name: 'Sleep', what: '+6 health per level' },
  { key: 'nutrition', g: 'Foundation', name: 'Nutrition', what: '+5 health per level' },
  { key: 'hydration', g: 'Foundation', name: 'Hydration', what: 'Regain health faster when not hit' },
  { key: 'outdoors', g: 'Foundation', name: 'Outdoors', what: 'Toughness: -3% damage taken' },
  { key: 'talk', g: 'Foundation', name: 'Talk', what: 'Heal 3 health per level when tagged in' },
  { key: 'recovery', g: 'Foundation', name: 'Recovery', what: 'Recover faster while tagged out' },
  { key: 'health', g: 'Foundation', name: 'Health', what: 'Slowly regain health when not hit' },
  { key: 'second_wind', g: 'Foundation', name: 'Second wind', what: 'Once a fight, heal 5/level when nearly out' },
]
export const AREA_KEYS = AREAS.map(a => a.key)
export const MAX_LV = 5
export const DAILY_GEMS = 60
export const costOf = lv => 3 + 2 * lv // next level from lv (3, 5, 7, 9, 11)
const LS = 'krfight-progress'
// Test mode: unlimited gems, upgrades kept on this device only (separate from real progress, never sent to
// the database). Switched on by opening the app once with ?krtest=1 (=0 turns it off) -- see main.jsx.
const LS_TEST = 'krfight-progress-test'
export const isTestMode = () => { try { return localStorage.getItem('krfight-testgems') === '1' } catch (e) { return false } }
export const UNLIMITED = 9999

const blank = () => ({ mode: 'local', training: {}, house_points: 0, game_gems: {}, spent: {}, upgrades: {}, gems_today: 0, gems_day: null, branches: {}, style_xp: {}, squad_styles: null, locked_at: null, last_change_season: null })
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
function writeLocal(p) { try { localStorage.setItem(LS, JSON.stringify({ game_gems: p.game_gems, spent: p.spent, upgrades: p.upgrades, gems_today: p.gems_today, gems_day: p.gems_day, branches: p.branches, style_xp: p.style_xp })) } catch (e) { /* ignore */ } }
const today = () => new Date().toISOString().slice(0, 10)

// load once when the game opens
export async function loadProgress() {
  if (isTestMode()) {
    let v = {}
    try { v = JSON.parse(localStorage.getItem(LS_TEST) || '{}') } catch (e) { /* ignore */ }
    return { ...blank(), upgrades: v.upgrades || {}, branches: v.branches || {}, style_xp: v.style_xp || {}, mode: 'test' }
  }
  try {
    const { data, error } = await supabase.rpc('krfight_profile')
    if (!error && data) return { ...blank(), ...data, mode: 'db' }
  } catch (e) { /* not set up yet / offline */ }
  return readLocal()
}

export const levelOf = (p, pillar, area) => n(p?.upgrades?.[pillar]?.[area])
export const fighterLevel = (p, pillar) => AREAS.reduce((a, x) => a + levelOf(p, pillar, x.key), 0)
export function available(p, pillar) { if (p.mode === 'test') return UNLIMITED; return n(p.training?.[pillar]) + n(p.game_gems?.[pillar]) - n(p.spent?.[pillar]) }
export function wild(p) { if (p.mode === 'test') return UNLIMITED; return n(p.house_points) - n(p.spent?.wild) }

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
  if (p.mode === 'test') {
    const next = { ...p, upgrades }
    try { localStorage.setItem(LS_TEST, JSON.stringify({ upgrades, branches: p.branches, style_xp: p.style_xp })) } catch (e) { /* ignore */ }
    return next
  }
  if (p.mode === 'db') {
    const { data, error } = await supabase.rpc('krfight_spend', { p_upgrades: upgrades, p_spent: spent, p_branches: p.branches || {} })
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
  if (p.mode === 'test') return { progress: p, given: { ...gems } } // shown, nothing to store
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
  cornerTaken: 1, grit: 1, stunGiven: 1, timing: 1,
  startMeter: 0, pressure: 1, feint: 1, composure: 1, confidence: 1, resilience: 0, comboTaken: 1, chess: 1, talk: 0, secondWind: 0 }
export function modsFor(up = {}) {
  const L = k => Math.min(MAX_LV, n(up[k]))
  return {
    ...BASE_MODS,
    blockChip: 1 - 0.12 * L('shapes'), punchDmg: 1 + 0.03 * L('punch_quality'), walk: 1 + 0.03 * L('footwork'),
    counters: 1 + 0.06 * L('counters'), opener: 1 + 0.06 * L('attack'), comboBonus: 1 + 0.05 * L('combinations'), comboGap: 3 * L('change_of_tempo'),
    specialDmg: 1 + 0.06 * L('use_of_phases'), reach: 1 + 0.02 * L('distance'), recovery: 1 - 0.04 * L('flow'), superDmg: 1 + 0.06 * L('self_expression'),
    backWalk: 1 + 0.05 * L('foot_speed'), startup: 1 - 0.04 * L('limb_speed'), chainEarly: L('combination_speed'), stunTaken: 1 - 0.05 * L('reaction'),
    heavyPunch: 1 + 0.06 * L('punching_power'), push: 1 + 0.06 * L('strength_upper'), kickDmg: 1 + 0.03 * L('strength_lower'), knockTaken: 1 - 0.07 * L('stability_core'),
    jump: 1 + 0.04 * L('agility'), kickRecovery: 1 - 0.05 * L('stop_n_go'), maxHp: 100 + 4 * L('stamina_aerobic') + 6 * L('sleep') + 5 * L('nutrition'), meterGain: 1 + 0.06 * L('stamina_anaerobic'),
    punchReach: 1 + 0.03 * L('suppleness_upper'), kickReach: 1 + 0.03 * L('suppleness_lower'), benchRegen: 1 + 0.25 * L('recovery'), regen: 0.004 * L('health') + 0.006 * L('hydration'),
    projTaken: 1 - 0.08 * L('read_opponent'), dmgTaken: (1 - 0.025 * L('defence')) * (1 - 0.03 * L('outdoors')), specialCd: 1 - 0.06 * L('tempo_rhythm'), tagCd: 1 - 0.1 * L('tactical_intelligence'), cornerTaken: 1 - 0.08 * L('ring_awareness'),
    heavyHold: 1 + 0.04 * L('know_strengths_weaknesses'), grit: 1 + 0.08 * L('heart_grit'), stunGiven: 1 + 0.05 * L('concentration'), timing: 1 + 0.07 * L('timing'),
    startMeter: 10 * L('game_plan'), pressure: 1 + 0.06 * L('pressure'), feint: 1 - 0.06 * L('feints'),
    composure: 1 - 0.06 * L('composure'), confidence: 1 + 0.03 * L('confidence'), resilience: 10 * L('resilience'), comboTaken: 1 - 0.06 * L('video_analysis'), chess: 1 + 0.05 * L('chess'),
    talk: 3 * L('talk'), secondWind: 5 * L('second_wind'),
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

// test mode: wipe the test upgrades and start again
export function resetTest(p) {
  try { localStorage.removeItem(LS_TEST) } catch (e) { /* ignore */ }
  return { ...p, upgrades: {}, branches: {}, style_xp: {} }
}

// ---- Collection: combo cards, graphic cards, win streak ----
// { combos: { id: level }, cards: { id: level }, streak }. Saved to the athlete's profile once
// supabase_krfight_collection.sql is run (krfight_match_end), on the device before that. Commons are always
// owned. Test mode owns everything at max level.
const LS_COLL = 'krfight-collection'
export const COMBO_MAX_LV = 3
const withCommons = combos => { const c = { ...(combos || {}) }; for (const x of COMBO_LIB) if (x.rarity === 'common' && !c[x.id]) c[x.id] = 1; return c }
export function loadCollection(p) {
  if (isTestMode() || (p && p.mode === 'test')) return { combos: Object.fromEntries(COMBO_LIB.map(c => [c.id, COMBO_MAX_LV])), cards: Object.fromEntries(CARDS.map(c => [c.id, CARD_MAX_LV])), streak: 0, test: true }
  if (p && p.mode === 'db' && p.collection) return { combos: withCommons(p.collection.combos), cards: { ...(p.collection.cards || {}) }, streak: n(p.win_streak) }
  let v = {}
  try { v = JSON.parse(localStorage.getItem(LS_COLL) || '{}') } catch (e) { /* ignore */ }
  return { combos: withCommons(v.combos), cards: { ...(v.cards || {}) }, streak: n(v.streak) }
}
export const ownsCombo = (coll, id) => (coll.combos[id] || 0) > 0
export const ownsCard = (coll, id) => ((coll.cards || {})[id] || 0) > 0
// a win may drop a combo card for one of the team's styles (rare / epic)
export function rollComboDrop(styles, level, won) {
  if (!won) return null
  if (import.meta.env && import.meta.env.DEV && globalThis.__krForceDrop) return globalThis.__krForceDrop // local testing only
  const chance = { easy: 0.15, medium: 0.25, hard: 0.4 }[level] ?? 0.25
  if (Math.random() > chance) return null
  const pool = COMBO_LIB.filter(c => c.rarity !== 'common' && c.styles.some(s => styles.includes(s)))
  if (!pool.length) return null
  const bag = pool.flatMap(c => Array(c.rarity === 'epic' ? 1 : 3).fill(c))
  return bag[Math.floor(Math.random() * bag.length)].id
}
// a win may drop a graphic card (rarer cards less often); every 3rd win in a row guarantees Rare or better
export function rollCardDrop(won, level, streakAfter) {
  if (!won) return null
  if (import.meta.env && import.meta.env.DEV && globalThis.__krForceCard) return globalThis.__krForceCard
  const guaranteed = streakAfter > 0 && streakAfter % 3 === 0
  const chance = { easy: 0.15, medium: 0.25, hard: 0.4 }[level] ?? 0.25
  if (!guaranteed && Math.random() > chance) return null
  const pool = CARDS.filter(c => !guaranteed || c.rarity !== 'common')
  const total = pool.reduce((t, c) => t + CARD_RARITY[c.rarity].weight, 0)
  let r = Math.random() * total
  for (const c of pool) { r -= CARD_RARITY[c.rarity].weight; if (r <= 0) return c.id }
  return pool[pool.length - 1].id
}
// end of a match: update the win streak and add any drops; returns { progress, coll, results }
export async function recordMatch(p, coll, won, drops) {
  const results = drops.map(d => {
    const store = d.kind === 'card' ? coll.cards : coll.combos, cur = (store || {})[d.id] || 0
    return { ...d, isNew: cur === 0, level: Math.min(d.kind === 'card' ? CARD_MAX_LV : COMBO_MAX_LV, cur + 1) }
  })
  if (coll.test) return { progress: p, coll, results }
  if (p.mode === 'db') {
    try {
      const { data, error } = await supabase.rpc('krfight_match_end', { p_won: !!won, p_drops: drops })
      if (!error && data) { const np = { ...blank(), ...data, mode: 'db' }; return { progress: np, coll: loadCollection(np), results } }
    } catch (e) { /* fall through */ }
    return { progress: p, coll, results: [] }
  }
  const next = { combos: { ...coll.combos }, cards: { ...(coll.cards || {}) }, streak: won ? n(coll.streak) + 1 : 0 }
  for (const r of results) (r.kind === 'card' ? next.cards : next.combos)[r.id] = r.level
  try { localStorage.setItem(LS_COLL, JSON.stringify(next)) } catch (e) { /* ignore */ }
  return { progress: p, coll: next, results }
}
// kept for older callers: add one combo card
export function addComboCard(coll, id) {
  if (!COMBO_BY_ID[id]) return { coll, isNew: false, level: 0 }
  const cur = coll.combos[id] || 0, level = Math.min(COMBO_MAX_LV, cur + 1)
  const next = { ...coll, combos: { ...coll.combos, [id]: level } }
  if (!coll.test) { try { localStorage.setItem(LS_COLL, JSON.stringify(next)) } catch (e) { /* ignore */ } }
  return { coll: next, isNew: cur === 0, level }
}
// skins unlock by collecting that fighter's cards
export function cardsOwnedFor(coll, fighterKey) { return CARDS.filter(c => c.fighter === fighterKey && ownsCard(coll, c.id)).length }
export function skinUnlocked(coll, fighterKey, skinKey) {
  const sk = SKIN_BY_KEY[skinKey]; if (!sk) return false
  if (coll.test || sk.need === 0) return true
  if (sk.need === 'legendary') return ownsCard(coll, `card_${fighterKey}_legendary`)
  return cardsOwnedFor(coll, fighterKey) >= sk.need
}

// ---- Style branches, style XP, lock-in and Change Tokens ----
// branches: { pillar: { branch, tier, paid: [tier numbers bought with gems] } }; style_xp: { pillar: xp }
export const branchOf = (p, pillar) => (p.branches && p.branches[pillar]) || { branch: null, tier: 0, paid: [] }
export const xpOf = (p, pillar) => n(p.style_xp && p.style_xp[pillar])
// can the next tier be unlocked, and how? -> { tier, byXp, gemPrice } or null when maxed
export function nextTier(p, pillar) {
  const b = branchOf(p, pillar), tier = (b.tier || 0) + 1
  if (tier > 3) return null
  const byXp = p.mode === 'test' || xpOf(p, pillar) >= TIER_XP[tier - 1]
  const cost = TIER_GEMS[tier - 1], fromColour = Math.min(cost, Math.max(0, available(p, pillar))), fromWild = cost - fromColour
  const gemPrice = fromWild <= Math.max(0, wild(p)) ? { cost, fromColour, fromWild } : null
  return { tier, byXp, gemPrice, cost }
}
// unlock the next tier (choosing the branch at tier 1). useGems: pay instead of XP.
export async function unlockTier(p, pillar, branchKey, useGems) {
  const b = branchOf(p, pillar), nt = nextTier(p, pillar)
  if (!nt) throw new Error('Already at the top tier')
  if (b.branch && branchKey && branchKey !== b.branch) throw new Error('Branch already chosen')
  if (!useGems && !nt.byXp) throw new Error('Not enough style XP yet')
  if (useGems && !nt.gemPrice) throw new Error('Not enough gems')
  const nb = { ...b, branch: b.branch || branchKey, tier: nt.tier, paid: useGems ? [...(b.paid || []), nt.tier] : [...(b.paid || [])] }
  const branches = { ...(p.branches || {}), [pillar]: nb }
  const spent = useGems && p.mode !== 'test' ? { ...p.spent, [pillar]: n(p.spent?.[pillar]) + nt.gemPrice.fromColour, wild: n(p.spent?.wild) + nt.gemPrice.fromWild } : p.spent
  if (p.mode === 'db') {
    const { data, error } = await supabase.rpc('krfight_spend', { p_upgrades: p.upgrades || {}, p_spent: spent, p_branches: branches })
    if (error) throw new Error(error.message)
    return { ...blank(), ...data, mode: 'db' }
  }
  const next = { ...p, branches, spent }
  if (p.mode === 'test') { try { localStorage.setItem(LS_TEST, JSON.stringify({ upgrades: p.upgrades, branches, style_xp: p.style_xp })) } catch (e) { /* ignore */ } }
  else writeLocal(next)
  return next
}
// style XP from a match: each fighter in the team (40 a win, 20 a loss); the server caps it per day
export async function awardXp(p, teamKeys, won) {
  const per = won ? 40 : 20, xp = {}
  for (const k of teamKeys) xp[k] = (xp[k] || 0) + per
  if (p.mode === 'db') {
    try { const { data, error } = await supabase.rpc('krfight_award_xp', { p_xp: xp }); if (!error && data) return { ...blank(), ...data, mode: 'db' } } catch (e) { /* ignore */ }
    return p
  }
  const style_xp = { ...(p.style_xp || {}) }
  for (const [k, v] of Object.entries(xp)) style_xp[k] = n(style_xp[k]) + v
  const next = { ...p, style_xp }
  if (p.mode === 'test') { try { localStorage.setItem(LS_TEST, JSON.stringify({ upgrades: p.upgrades, branches: p.branches, style_xp })) } catch (e) { /* ignore */ } }
  else writeLocal(next)
  return next
}
// lock-in only applies to real athletes once the SQL is in (db mode); test / device modes never lock
export const isLocked = p => p.mode === 'db' && !!p.locked_at
export const tokenAvailable = p => isLocked(p) && p.last_change_season !== seasonOf()
export async function lockSquad(p, styles) {
  if (p.mode !== 'db') return p
  const { data, error } = await supabase.rpc('krfight_lock', { p_styles: styles })
  if (error) throw new Error(error.message)
  return { ...blank(), ...data, mode: 'db' }
}
// use this season's Change Token: new style for one fighter (resets its branch and style XP)
export async function changeStyle(p, pillar, style) {
  if (p.mode !== 'db') {
    const branches = { ...(p.branches || {}) }
    const ob = branches[pillar] || {}, sunk = (ob.sunk || 0) + (ob.paid || []).reduce((a, t) => a + TIER_GEMS[t - 1], 0)
    branches[pillar] = { branch: null, tier: 0, paid: [], sunk }
    const style_xp = { ...(p.style_xp || {}) }; delete style_xp[pillar]
    const next = { ...p, branches, style_xp }
    if (p.mode === 'test') { try { localStorage.setItem(LS_TEST, JSON.stringify({ upgrades: p.upgrades, branches, style_xp })) } catch (e) { /* ignore */ } } else writeLocal(next)
    return next
  }
  const { data, error } = await supabase.rpc('krfight_change_style', { p_pillar: pillar, p_style: style })
  if (error) throw new Error(error.message)
  return { ...blank(), ...data, mode: 'db' }
}
// the CPU's branches: random branch, tier by level
export function cpuBranch(style, level) {
  const list = BRANCHES[style] || []
  if (!list.length) return null
  const tier = { easy: 0, medium: 1, hard: 2 }[level] ?? 1
  return tier ? { branch: list[Math.floor(Math.random() * list.length)].key, tier } : null
}

// ---- Player vs player ----
// Your defence team = the squad you fight with (saved whenever you fight). Opponents are other athletes'
// defence teams, played by the CPU. Before supabase_krfight_pvp.sql is run (and in test mode) the Arena uses
// practice opponents made up on the device, so everything can be tried.
const LS_PVP = 'krfight-pvp-local'
export async function saveDefence(p, squad) {
  if (p.mode !== 'db') return
  const order = (squad.order || []).map(i => PILLARS_BY_INDEX[i]).filter(Boolean)
  if (!order.length) return
  try { await supabase.rpc('krfight_set_defence', { p_defence: { order, styles: squad.styles, loadouts: squad.loadouts || {}, skins: squad.skins || {} } }) } catch (e) { /* ignore */ }
}
const PILLARS_BY_INDEX = ['mentality', 'technical', 'tactical', 'physical', 'foundation'] // same order as FIGHTERS
export { PILLARS_BY_INDEX }
const STYLE_POOL = ['kickboxer', 'pro', 'am', 'tkd', 'thai']
const PRACTICE_NAMES = ['Practice · Alex P', 'Practice · Jordan K', 'Practice · Sam T', 'Practice · Riley M', 'Practice · Casey B', 'Practice · Morgan D']
const PRACTICE_HOUSES = ['Dragon', 'Super', 'Jet', 'Ice', 'Storm', 'Dragon']
// deterministic made-up squads at a spread of levels
function practiceOpponents() {
  let seed = 7
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  return PRACTICE_NAMES.map((name, i) => {
    const size = 1 + (i % 3), order = [...PILLARS_BY_INDEX].sort(() => rnd() - 0.5).slice(0, size + 1)
    const styles = Object.fromEntries(PILLARS_BY_INDEX.map(k => [k, STYLE_POOL[Math.floor(rnd() * 5)]]))
    const lvl = i // 0..5: tougher down the list
    const upgrades = Object.fromEntries(order.map(k => [k, Object.fromEntries(AREAS.filter(() => rnd() < 0.35).map(a => [a.key, Math.min(MAX_LV, Math.round(rnd() * lvl))]))]))
    const branches = Object.fromEntries(order.map(k => { const list = BRANCHES[styles[k]] || []; return [k, lvl >= 2 && list.length ? { branch: list[Math.floor(rnd() * list.length)].key, tier: Math.min(3, Math.floor(lvl / 2)) } : { branch: null, tier: 0 }] }))
    const cards = Object.fromEntries(CARDS.filter(() => rnd() < 0.25 + lvl * 0.05).map(c => [c.id, 1]))
    const combos = Object.fromEntries(COMBO_LIB.filter(c => c.rarity !== 'common' && rnd() < 0.2 + lvl * 0.05).map(c => [c.id, 1]))
    return { student_id: `practice-${i}`, practice: true, name, house: PRACTICE_HOUSES[i], age_category: i % 2 ? 'Senior' : 'Junior',
      defence: { order, styles, loadouts: {}, skins: {} }, styles, upgrades, branches, collection: { cards, combos }, pvp_wins: 0, pvp_losses: 0 }
  })
}
function localPvp() { try { return JSON.parse(localStorage.getItem(LS_PVP) || '{}') } catch (e) { return {} } }
export async function loadOpponents(p) {
  if (p.mode === 'db') {
    try { const { data, error } = await supabase.rpc('krfight_opponents'); if (!error && Array.isArray(data)) return { list: data, practice: false } } catch (e) { /* fall through */ }
  }
  const lp = localPvp(), today = new Date().toISOString().slice(0, 10)
  return { list: practiceOpponents().map(o => ({ ...o, rewarded_today: (lp.rewarded || {})[o.student_id] === today })), practice: true }
}
export const opponentLevel = o => Object.values(o.upgrades || {}).reduce((t, up) => t + Object.values(up || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0)
// what you could copy from a beaten opponent: things you don't have first, then things you can level up
export function rewardChoices(opp, coll) {
  const out = []
  for (const [id, lv] of Object.entries((opp.collection || {}).cards || {})) if (lv > 0 && CARD_BY_ID[id]) out.push({ kind: 'card', id, have: (coll.cards || {})[id] || 0 })
  for (const [id, lv] of Object.entries((opp.collection || {}).combos || {})) if (lv > 0 && COMBO_BY_ID[id] && COMBO_BY_ID[id].rarity !== 'common') out.push({ kind: 'combo', id, have: (coll.combos || {})[id] || 0 })
  return out.filter(x => x.have < (x.kind === 'card' ? CARD_MAX_LV : COMBO_MAX_LV)).sort((a, b) => (a.have > 0) - (b.have > 0)).slice(0, 6)
}
// record a challenge; pick = { kind, id } to copy (when won). Returns { progress, coll, reward }
export async function pvpResult(p, coll, opp, won, pick) {
  if (p.mode === 'db' && !opp.practice) {
    try {
      const { data, error } = await supabase.rpc('krfight_pvp_result', { p_opponent: opp.student_id, p_won: !!won, p_pick: pick || null })
      if (!error && data) { const np = { ...blank(), ...data, mode: 'db' }; return { progress: np, coll: loadCollection(np), reward: data.pvp_reward || null } }
    } catch (e) { /* ignore */ }
    return { progress: p, coll, reward: null }
  }
  // practice / device: keep a small local record + apply the copy to the device collection
  const lp = localPvp(), today = new Date().toISOString().slice(0, 10)
  lp.wins = (lp.wins || 0) + (won ? 1 : 0); lp.losses = (lp.losses || 0) + (won ? 0 : 1)
  let reward = null, nc = coll
  if (won && pick && (lp.rewarded || {})[opp.student_id] !== today) {
    lp.rewarded = { ...(lp.rewarded || {}), [opp.student_id]: today }
    const res = await recordMatch(p, coll, true, [pick]); nc = res.coll; reward = pick
  }
  try { localStorage.setItem(LS_PVP, JSON.stringify(lp)) } catch (e) { /* ignore */ }
  return { progress: p, coll: nc, reward }
}
export async function loadLeaderboard(p, age) {
  if (p.mode === 'db') {
    try { const { data, error } = await supabase.rpc('krfight_leaderboard', { p_age: age || null }); if (!error && data) return { ...data, practice: false } } catch (e) { /* fall through */ }
  }
  const lp = localPvp()
  return { practice: true, season: seasonOf(), houses: [], athletes: [{ name: 'You (practice)', house: '', age: '', wins: lp.wins || 0, losses: lp.losses || 0, me: true }], ages: [], me: { wins: lp.wins || 0, losses: lp.losses || 0, rank: 1 } }
}
