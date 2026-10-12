// KR FIGHT 2 -- saved progress: gems and fighter upgrades.
// Uses the krfight_* database functions (supabase_krfight_progress.sql). Until that SQL has been run --
// or for staff, who have no athlete record -- progress is kept on the device instead, so the game works
// either way. Gems: training entries per pillar + house points (wild) + gems won in the game.
import { supabase } from '../../../lib/supabase.js'

export const PILLARS = ['physical', 'technical', 'tactical', 'mentality', 'foundation']
export const AREAS = [
  { key: 'power', name: 'Power', what: '+4% damage per level' },
  { key: 'speed', name: 'Speed', what: '+2.5% movement per level' },
  { key: 'defence', name: 'Defence', what: '-3% damage taken per level' },
  { key: 'stamina', name: 'Stamina', what: '+5 health per level' },
  { key: 'special', name: 'Special', what: 'Faster special, +5% super meter per level' },
]
export const MAX_LV = 10
export const DAILY_GEMS = 60
export const costOf = lv => 4 + 3 * lv // next level from lv
const LS = 'krfight-progress'

const blank = () => ({ mode: 'local', training: {}, house_points: 0, game_gems: {}, spent: {}, upgrades: {}, gems_today: 0, gems_day: null })
const n = v => Math.max(0, Math.floor(Number(v) || 0))

function readLocal() {
  try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); if (v) return { ...blank(), ...v, mode: 'local' } } catch (e) { /* ignore */ }
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

// upgrade effects folded into a fighter's def (player side); cpuScale lets the CPU keep up a little
export function applyUpgrades(def, up = {}) {
  const L = k => Math.min(MAX_LV, n(up[k]))
  return {
    ...def,
    power: def.power * (1 + 0.04 * L('power')),
    speed: def.speed * (1 + 0.025 * L('speed')),
    defMul: 1 - 0.03 * L('defence'),
    maxHp: 100 + 5 * L('stamina'),
    cdMul: 1 - 0.05 * L('special'),
    meterMul: 1 + 0.05 * L('special'),
    up: { power: L('power'), speed: L('speed'), defence: L('defence'), stamina: L('stamina'), special: L('special') },
  }
}
// the CPU gets a share of the player's average upgrade level so harder levels stay a challenge
export function cpuUpgrades(p, level) {
  const share = { easy: 0.3, medium: 0.6, hard: 1 }[level] ?? 0.6
  const out = {}
  for (const a of AREAS) {
    const avg = PILLARS.reduce((s, k) => s + levelOf(p, k, a.key), 0) / PILLARS.length
    out[a.key] = Math.round(avg * share)
  }
  return out
}
