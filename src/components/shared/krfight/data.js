// KR FIGHT 2 -- shared game data (ported 1:1 from the classic FightGame.jsx so the feel is identical)
export const W = 800, H = 450, FLOOR = 380, GRAV = 0.9
export const COMBO_GAP = 36 // frames allowed between combo inputs

export const SUPER_NAME = { wave: 'Mind Storm', rush: 'Thousand Fists', counter: 'Perfect Read', upper: 'Titan Smash', quake: 'Earthbreaker' }

// How each fighter looks (drawn in code on the shared skeleton). build: shoulder/hip half-widths,
// limb thickness scale. hair: style + colour. Everyone wears the KR kit: dark rash guard with a pillar-
// colour stripe, pillar-colour shorts, gloves and headband.
export const LOOKS = {
  mentality: { skin: '#8D5524', hair: 'bun', hairCol: '#1B1210', sh: 19, chest: 17, waist: 13, hip: 15, limb: 0.95 },
  technical: { skin: '#F1C27D', hair: 'spiky', hairCol: '#D9A441', sh: 18, chest: 16, waist: 12, hip: 13, limb: 0.88 },
  tactical: { skin: '#C68642', hair: 'mohawk', hairCol: '#20140C', sh: 20, chest: 18, waist: 13, hip: 14, limb: 0.95 },
  physical: { skin: '#E0AC69', hair: 'buzz', hairCol: '#3A2A1E', sh: 25, chest: 23, waist: 16, hip: 16, limb: 1.22 },
  foundation: { skin: '#5C3A21', hair: 'ponytail', hairCol: '#120C08', sh: 20, chest: 17, waist: 14, hip: 17, limb: 1.05 },
}

// Fighters are called by colour (name); pillar is kept for reference
export const FIGHTERS = [
  { key: 'mentality', name: 'GREEN', pillar: 'Mentality', colour: '#22B14C', trim: '#0E5F27', speed: 4.2, power: 1.0, reach: 1.0, special: 'wave', specialName: 'Focus Wave', combos: [{ name: 'Jab · Jab · Cross', seq: ['lp', 'lp', 'mp'], bonus: 1.6 }, { name: 'Teep · Cross · Hook', seq: ['lk', 'mp', 'hp'], bonus: 1.7 }, { name: 'Jab · High Kick · Focus Wave', seq: ['lp', 'hk', 'sp'], bonus: 1.5 }] },
  { key: 'technical', name: 'BLUE', pillar: 'Technical', colour: '#2F6BFF', trim: '#13306F', speed: 4.6, power: 0.95, reach: 1.05, special: 'rush', specialName: 'Combo Rush', combos: [{ name: 'Jab · Cross · Hook', seq: ['lp', 'mp', 'hp'], bonus: 1.6 }, { name: 'Jab · Body Kick · High Kick', seq: ['lp', 'mk', 'hk'], bonus: 1.7 }, { name: 'Jab Blitz', seq: ['lp', 'lp', 'lp', 'lp'], bonus: 2.0 }] },
  { key: 'tactical', name: 'RED', pillar: 'Tactical', colour: '#FF2A2A', trim: '#6F1010', speed: 4.3, power: 1.0, reach: 1.0, special: 'counter', specialName: 'Counter', combos: [{ name: 'Step Back · Cross · Hook', seq: ['b', 'mp', 'hp'], bonus: 1.7 }, { name: 'Jab Feint · High Kick', seq: ['lp', 'f', 'hk'], bonus: 1.7 }, { name: 'Teep · Teep · Cross', seq: ['lk', 'lk', 'mp'], bonus: 1.6 }] },
  { key: 'physical', name: 'YELLOW', pillar: 'Physical', colour: '#E6B800', trim: '#6A5400', speed: 3.8, power: 1.2, reach: 0.95, special: 'upper', specialName: 'Power Uppercut', combos: [{ name: 'Cross · Hook · Hook', seq: ['mp', 'hp', 'hp'], bonus: 1.5 }, { name: 'Duck · Cross · Hook', seq: ['d', 'mp', 'hp'], bonus: 1.7 }, { name: 'Charge · Hook', seq: ['f', 'f', 'hp'], bonus: 1.8 }] },
  { key: 'foundation', name: 'PURPLE', pillar: 'Foundation', colour: '#C93BFF', trim: '#55157A', speed: 3.9, power: 1.05, reach: 1.0, special: 'quake', specialName: 'Shockwave', combos: [{ name: 'Teep · Body Kick · High Kick', seq: ['lk', 'mk', 'hk'], bonus: 1.7 }, { name: 'Sweep · Hook', seq: ['d', 'lk', 'hp'], bonus: 1.7 }, { name: 'Jab · Teep · Cross · High Kick', seq: ['lp', 'lk', 'mp', 'hk'], bonus: 1.9 }] },
]

// Every strike in the game: startup / active / recovery frames, damage, reach (px), hit height.
// Heavier strikes start slower and hit harder. Styles (below) decide which strike each button throws.
export const LIB = {
  jab: { s: 3, a: 3, r: 7, dmg: 5, reach: 62, h: 'high', push: 4, name: 'Jab' },
  cross: { s: 5, a: 3, r: 11, dmg: 8, reach: 68, h: 'high', push: 6, name: 'Cross' },
  hook: { s: 8, a: 4, r: 16, dmg: 12, reach: 64, h: 'high', push: 10, name: 'Hook' },
  overhand: { s: 10, a: 4, r: 18, dmg: 14, reach: 66, h: 'high', push: 11, name: 'Overhand' },
  bodyjab: { s: 4, a: 3, r: 8, dmg: 5, reach: 60, h: 'mid', push: 4, name: 'Body Jab' },
  bodyhook: { s: 7, a: 3, r: 13, dmg: 10, reach: 58, h: 'mid', push: 8, name: 'Body Hook' },
  uppercut: { s: 8, a: 4, r: 16, dmg: 13, reach: 54, h: 'mid', push: 10, name: 'Uppercut' },
  elbow: { s: 6, a: 3, r: 14, dmg: 12, reach: 50, h: 'high', push: 7, name: 'Elbow' },
  teep: { s: 5, a: 3, r: 10, dmg: 6, reach: 80, h: 'mid', push: 9, name: 'Teep' },
  bodykick: { s: 7, a: 3, r: 14, dmg: 9, reach: 86, h: 'mid', push: 8, name: 'Body Kick' },
  highkick: { s: 10, a: 4, r: 19, dmg: 13, reach: 92, h: 'mid', push: 11, name: 'High Kick' },
  roundkick: { s: 4, a: 3, r: 9, dmg: 7, reach: 84, h: 'mid', push: 6, name: 'Round Kick' },
  sidekick: { s: 7, a: 3, r: 13, dmg: 10, reach: 100, h: 'mid', push: 12, name: 'Side Kick' },
  spinkick: { s: 11, a: 4, r: 20, dmg: 15, reach: 96, h: 'high', push: 13, name: 'Spinning Kick' },
  lowkick: { s: 6, a: 3, r: 12, dmg: 9, reach: 78, h: 'low', push: 5, name: 'Low Kick' },
  knee: { s: 6, a: 4, r: 13, dmg: 13, reach: 50, h: 'mid', push: 9, name: 'Knee' },
  clp: { s: 3, a: 3, r: 8, dmg: 4, reach: 60, h: 'mid', push: 3 },
  clk: { s: 5, a: 3, r: 12, dmg: 7, reach: 90, h: 'low', push: 6 },
  jk: { s: 3, a: 8, r: 4, dmg: 9, reach: 70, h: 'high', push: 6 },
}
export const MOVES = LIB

// Fighting styles. moves: what each button throws (tap / hold / long hold). Stats multiply the fighter's
// own. Combos are written for the style so they flow like it.
export const STYLES = {
  kickboxer: { name: 'Freestyle Kickboxing', blurb: 'All-rounder: punches and kicks flow together', speed: 1, power: 1, reach: 1,
    moves: { lp: 'jab', mp: 'cross', hp: 'hook', lk: 'teep', mk: 'bodykick', hk: 'highkick' },
    combos: [{ name: 'Jab · Cross · Hook', seq: ['lp', 'mp', 'hp'], bonus: 1.6 }, { name: 'Jab · Cross · Body Kick', seq: ['lp', 'mp', 'mk'], bonus: 1.7 }, { name: 'Teep · Cross · High Kick', seq: ['lk', 'mp', 'hk'], bonus: 1.8 }] },
  pro: { name: 'Pro Boxer', blurb: 'Punches only: heavy body shots, uppercuts and overhands', speed: 0.92, power: 1.18, reach: 1,
    moves: { lp: 'jab', mp: 'cross', hp: 'overhand', lk: 'bodyjab', mk: 'bodyhook', hk: 'uppercut' },
    combos: [{ name: 'Jab · Body Hook · Overhand', seq: ['lp', 'mk', 'hp'], bonus: 1.8 }, { name: 'Body Jab · Cross · Overhand', seq: ['lk', 'mp', 'hp'], bonus: 1.7 }, { name: 'Jab · Jab · Uppercut', seq: ['lp', 'lp', 'hk'], bonus: 1.6 }] },
  am: { name: 'Amateur Boxer', blurb: 'Punches only: fast, sharp combinations', speed: 1.12, power: 0.88, reach: 1, startup: -1,
    moves: { lp: 'jab', mp: 'cross', hp: 'hook', lk: 'bodyjab', mk: 'bodyhook', hk: 'uppercut' },
    combos: [{ name: 'Jab · Jab · Cross · Hook', seq: ['lp', 'lp', 'mp', 'hp'], bonus: 2.0 }, { name: 'Jab · Body Jab · Cross', seq: ['lp', 'lk', 'mp'], bonus: 1.6 }, { name: 'Hook · Uppercut · Hook', seq: ['hp', 'hk', 'hp'], bonus: 1.7 }] },
  tkd: { name: 'Taekwondo', blurb: 'Kick specialist: long, fast and spinning kicks; light hands', speed: 1.08, power: 0.95, reach: 1.1, punchPower: 0.8,
    moves: { lp: 'jab', mp: 'cross', hp: 'hook', lk: 'roundkick', mk: 'sidekick', hk: 'spinkick' },
    combos: [{ name: 'Round · Round · Spinning Kick', seq: ['lk', 'lk', 'hk'], bonus: 1.8 }, { name: 'Side · Round · Side Kick', seq: ['mk', 'lk', 'mk'], bonus: 1.7 }, { name: 'Jab · Round Kick · Spinning Kick', seq: ['lp', 'lk', 'hk'], bonus: 1.7 }] },
  thai: { name: 'K1 Kickboxing', blurb: 'Low kicks, knees and heavy hooks: short range, punishing', speed: 0.96, power: 1.1, reach: 0.95,
    moves: { lp: 'jab', mp: 'cross', hp: 'hook', lk: 'teep', mk: 'lowkick', hk: 'knee' },
    combos: [{ name: 'Jab · Cross · Low Kick', seq: ['lp', 'mp', 'mk'], bonus: 1.7 }, { name: 'Teep · Hook · Knee', seq: ['lk', 'hp', 'hk'], bonus: 1.8 }, { name: 'Low Kick · Low Kick · Hook', seq: ['mk', 'mk', 'hp'], bonus: 1.6 }] },
}
export const STYLE_KEYS = ['kickboxer', 'pro', 'am', 'tkd', 'thai']
// a pillar fighter in a style: same colours / special / super, style's moves, combos and stat changes
// ---- Real combinations: the library each style draws from ----
// seq = the buttons (lp/mp/hp = punch tap/hold/long hold, lk/mk/hk = kick; d/f/b = down/forward/back tap).
// Boxing uses the club numbering (1 jab, 2 cross, 3 hook, 6 rear uppercut). rarity: common (owned from the
// start), rare, epic -- rare/epic drop as combo cards from wins. bonus = damage multiplier on the finishing strike.
export const RARITY = { common: { name: 'Common', colour: '#9AA3AE' }, rare: { name: 'Rare', colour: '#4DA3FF' }, epic: { name: 'Epic', colour: '#C93BFF' } }
const BOX = ['pro', 'am']
export const COMBO_LIB = [
  // boxing
  { id: 'b_12', styles: BOX, name: '1-2', seq: ['lp', 'mp'], bonus: 1.3, rarity: 'common' },
  { id: 'b_112', styles: BOX, name: '1-1-2', seq: ['lp', 'lp', 'mp'], bonus: 1.5, rarity: 'common' },
  { id: 'b_123', styles: BOX, name: '1-2-3', seq: ['lp', 'mp', 'hp'], bonus: 1.6, rarity: 'common' },
  { id: 'b_jabupdown', styles: BOX, name: 'Jab Up & Down', seq: ['lp', 'lk'], bonus: 1.3, rarity: 'common' },
  { id: 'b_body32', styles: BOX, name: 'Body 3 · Head 2', seq: ['mk', 'mp'], bonus: 1.5, rarity: 'rare' },
  { id: 'b_slip23', styles: BOX, name: 'Slip · 2-3', seq: ['d', 'mp', 'hp'], bonus: 1.7, rarity: 'rare' },
  { id: 'b_1632', styles: BOX, name: '1-6-3-2', seq: ['lp', 'hk', 'hp', 'mp'], bonus: 2.0, rarity: 'epic' },
  { id: 'b_1263', styles: BOX, name: '1-2-6-3', seq: ['lp', 'mp', 'hk', 'hp'], bonus: 2.0, rarity: 'epic' },
  // freestyle kickboxing
  { id: 'f_jabteep', styles: ['kickboxer'], name: 'Jab · Teep', seq: ['lp', 'lk'], bonus: 1.3, rarity: 'common' },
  { id: 'f_123', styles: ['kickboxer'], name: '1-2-3', seq: ['lp', 'mp', 'hp'], bonus: 1.6, rarity: 'common' },
  { id: 'f_12rh', styles: ['kickboxer'], name: '1-2 · Roundhouse', seq: ['lp', 'mp', 'mk'], bonus: 1.7, rarity: 'common' },
  { id: 'f_teep2hk', styles: ['kickboxer'], name: 'Teep · Cross · High Kick', seq: ['lk', 'mp', 'hk'], bonus: 1.8, rarity: 'common' },
  { id: 'f_bodyhead', styles: ['kickboxer'], name: 'Body Kick · High Kick', seq: ['mk', 'hk'], bonus: 1.6, rarity: 'rare' },
  { id: 'f_3hook', styles: ['kickboxer'], name: 'Hook · Body Kick', seq: ['hp', 'mk'], bonus: 1.6, rarity: 'rare' },
  { id: 'f_123hk', styles: ['kickboxer'], name: '1-2-3 · High Kick', seq: ['lp', 'mp', 'hp', 'hk'], bonus: 2.0, rarity: 'epic' },
  // taekwondo
  { id: 't_rr', styles: ['tkd'], name: 'Double Round Kick', seq: ['lk', 'lk'], bonus: 1.4, rarity: 'common' },
  { id: 't_cut', styles: ['tkd'], name: 'Cut Kick · Round Kick', seq: ['mk', 'lk'], bonus: 1.5, rarity: 'common' },
  { id: 't_rrs', styles: ['tkd'], name: 'Round · Round · Spinning', seq: ['lk', 'lk', 'hk'], bonus: 1.8, rarity: 'common' },
  { id: 't_jrs', styles: ['tkd'], name: 'Jab · Round · Spinning', seq: ['lp', 'lk', 'hk'], bonus: 1.7, rarity: 'common' },
  { id: 't_srs', styles: ['tkd'], name: 'Side · Round · Side', seq: ['mk', 'lk', 'mk'], bonus: 1.7, rarity: 'rare' },
  { id: 't_backspin', styles: ['tkd'], name: 'Step Back · Spinning Kick', seq: ['b', 'hk'], bonus: 1.6, rarity: 'rare' },
  { id: 't_rrrs', styles: ['tkd'], name: 'Round ×3 · Spinning', seq: ['lk', 'lk', 'lk', 'hk'], bonus: 2.1, rarity: 'epic' },
  // K1 kickboxing
  { id: 'k_1low', styles: ['thai'], name: 'Jab · Low Kick', seq: ['lp', 'mk'], bonus: 1.4, rarity: 'common' },
  { id: 'k_12low', styles: ['thai'], name: '1-2 · Low Kick', seq: ['lp', 'mp', 'mk'], bonus: 1.7, rarity: 'common' },
  { id: 'k_teephk', styles: ['thai'], name: 'Teep · Hook · Knee', seq: ['lk', 'hp', 'hk'], bonus: 1.8, rarity: 'common' },
  { id: 'k_ll3', styles: ['thai'], name: 'Low · Low · Hook', seq: ['mk', 'mk', 'hp'], bonus: 1.6, rarity: 'common' },
  { id: 'k_lowhooklow', styles: ['thai'], name: 'Low Kick · Hook · Low Kick', seq: ['mk', 'hp', 'mk'], bonus: 1.8, rarity: 'rare' },
  { id: 'k_kneeknee', styles: ['thai'], name: 'Knee · Knee · Hook', seq: ['hk', 'hk', 'hp'], bonus: 1.7, rarity: 'rare' },
  { id: 'k_123knee', styles: ['thai'], name: '1-2-3 · Knee', seq: ['lp', 'mp', 'hp', 'hk'], bonus: 2.0, rarity: 'epic' },
]
export const COMBO_BY_ID = Object.fromEntries(COMBO_LIB.map(c => [c.id, c]))
export const LOADOUT_SIZE = 4
export const combosForStyle = style => COMBO_LIB.filter(c => c.styles.includes(style))
// starting loadout for a style: its first 4 commons
export const defaultLoadout = style => combosForStyle(style).filter(c => c.rarity === 'common').slice(0, LOADOUT_SIZE).map(c => c.id)

// ---- Flow: which strike naturally follows which (landing them in these orders builds FLOW) ----
export const FLOW_NEXT = {
  jab: ['jab', 'cross', 'hook', 'bodyjab', 'uppercut', 'teep', 'lowkick', 'roundkick', 'bodykick', 'highkick'],
  cross: ['hook', 'jab', 'bodyhook', 'uppercut', 'lowkick', 'bodykick', 'highkick', 'knee'],
  hook: ['cross', 'uppercut', 'bodyhook', 'overhand', 'lowkick', 'bodykick', 'knee', 'highkick'],
  overhand: ['hook', 'bodyhook', 'uppercut'],
  bodyjab: ['jab', 'cross', 'overhand', 'bodyhook'],
  bodyhook: ['cross', 'hook', 'overhand', 'uppercut'],
  uppercut: ['hook', 'cross', 'overhand'],
  teep: ['jab', 'cross', 'roundkick', 'sidekick', 'hook'],
  bodykick: ['highkick', 'cross', 'jab'],
  highkick: ['jab', 'cross'],
  roundkick: ['roundkick', 'spinkick', 'sidekick', 'jab'],
  sidekick: ['roundkick', 'spinkick', 'jab'],
  spinkick: ['jab', 'roundkick'],
  lowkick: ['hook', 'cross', 'lowkick', 'knee'],
  knee: ['hook', 'cross', 'knee'],
}
export const FLOW_MAX = 10

// a pillar fighter in a style: same colours / special / super, style's moves and stat changes, and the
// combos equipped in its loadout (each combo's level from duplicate cards adds +5% bonus per level above 1)
export function styledDef(base, styleKey, loadout, levels = {}) {
  const st = STYLES[styleKey] || STYLES.kickboxer
  const ids = (loadout && loadout.length ? loadout : defaultLoadout(styleKey)).filter(id => COMBO_BY_ID[id] && COMBO_BY_ID[id].styles.includes(styleKey)).slice(0, LOADOUT_SIZE)
  const combos = ids.map(id => { const c = COMBO_BY_ID[id], lv = Math.max(1, levels[id] || 1); return { ...c, bonus: c.bonus * (1 + 0.05 * (lv - 1)), level: lv } })
  return { ...base, style: styleKey, styleName: st.name, speed: base.speed * st.speed, power: base.power * st.power, reach: base.reach * st.reach,
    moves: st.moves, combos, startup: st.startup || 0, punchPower: st.punchPower || 1 }
}
// squad set-up (style per pillar + fight order), remembered on the device for now
export function loadSquad() {
  try { const v = JSON.parse(localStorage.getItem('krfight-squad') || 'null'); if (v && v.styles && Array.isArray(v.order)) return v } catch (e) { /* ignore */ }
  return { styles: { physical: 'pro', technical: 'kickboxer', tactical: 'thai', mentality: 'am', foundation: 'tkd' }, order: [0, 1, 2], loadouts: {}, skins: {} }
}
export function saveSquad(sq) { try { localStorage.setItem('krfight-squad', JSON.stringify(sq)) } catch (e) { /* ignore */ } }
export const MAX_TEAM = 5

// crouching / jumping versions scale with how long the button was held
export const LEVEL_SCALE = { l: { dmg: 1, s: 0 }, m: { dmg: 1.35, s: 2 }, h: { dmg: 1.75, s: 4 } }
// hold time (ms) for each level
export const CHARGE_MS = { m: 180, h: 450 }

export const LEVELS = {
  easy: { react: 22, aggro: 0.3, block: 0.25, special: 0.002, smart: 0.25 },
  medium: { react: 10, aggro: 0.5, block: 0.55, special: 0.006, smart: 0.6 },
  hard: { react: 5, aggro: 0.65, block: 0.8, special: 0.012, smart: 0.9 },
}

const TOKEN = { f: '▶', b: '◀', d: '▼', lp: 'LP', mp: 'MP', hp: 'HP', lk: 'LK', mk: 'MK', hk: 'HK', sp: 'SP' }
export const comboLabel = seq => seq.map(t => TOKEN[t] || t).join(' ')
export const hex = s => parseInt(s.slice(1), 16)

// Looks are levels. Level 1 Cartoon, Level 2 Stickman, Level 3 House themes. Everything is open while
// testing; later isLookUnlocked() can check the athlete's game level so better looks unlock as they progress.
export const LOOK_LEVELS = [
  { key: 'cartoon', level: 1, name: 'Cartoon' },
  { key: 'stick', level: 2, name: 'Stickman' },
  { key: 'house', level: 3, name: 'Houses' },
  { key: '3d', level: 4, name: '3D' },          // fight drawn in 3D (menus use the Stickman look)
]
export const isLookUnlocked = () => true
let LOOK = (() => { try { return localStorage.getItem('krfight-look') || 'stick' } catch (e) { return 'stick' } })()
export const getLook = () => LOOK
export const setLook = v => { LOOK = v; try { localStorage.setItem('krfight-look', v) } catch (e) { /* ignore */ } }

// House themes (level 3): black silhouette, glowing house-colour rim + eyes, and a signature effect.
export const HOUSES = {
  dragon: { name: 'Dragon', colour: '#E0262B', glow: '#FF5A45', head: 'band', aura: 'dragon' },
  super: { name: 'Super', colour: '#FF7A1A', glow: '#FFE0A0', head: 'spiky', aura: 'flame' },
  jet: { name: 'Jet', colour: '#62D836', glow: '#C4FF8A', head: 'band', aura: 'speed' },
  ice: { name: 'Ice', colour: '#4FB2FF', glow: '#D6F1FF', head: 'mask', aura: 'frost' },
  storm: { name: 'Storm', colour: '#A04BFF', glow: '#E6CCFF', head: 'hood', aura: 'storm' },
}
export const HOUSE_KEYS = Object.keys(HOUSES)
let HOUSE = (() => { try { const h = localStorage.getItem('krfight-house'); return HOUSES[h] ? h : 'dragon' } catch (e) { return 'dragon' } })()
export const getHouse = () => HOUSE
export const setHouse = v => { HOUSE = v; try { localStorage.setItem('krfight-house', v) } catch (e) { /* ignore */ } }
// colour used for a fighter's trails, sparks and effects in the current look
export const fxColour = f => getLook() === 'house' && HOUSES[f.theme] ? HOUSES[f.theme].colour : f.def.colour

// CPU's house in the house look: its fighter's natural house, or the next one if that's the player's
export const NATURAL_HOUSE = { tactical: 'dragon', physical: 'super', mentality: 'jet', technical: 'ice', foundation: 'storm' }
export function cpuHouse(def, playerHouse) {
  let h = NATURAL_HOUSE[def.key] || 'dragon'
  if (h === playerHouse) h = HOUSE_KEYS[(HOUSE_KEYS.indexOf(h) + 1) % HOUSE_KEYS.length]
  return h
}

// ---- Style branches: each style splits three ways so the same style grows differently per fighter ----
// Each branch has 3 tiers. An effect can multiply (mul) or add to (add) the fighter's upgrade modifiers,
// change what a button throws (moves), or unlock a signature combo (combo, an extra 5th combo).
// Tiers unlock from style XP (fighting) or can be bought with gems.
export const TIER_XP = [100, 300, 700]      // style XP needed for tiers 1, 2, 3
export const TIER_GEMS = [20, 40, 70]       // or buy the tier with gems of the fighter's colour (wild gems top up)
const sig = (style, id, name, seq, bonus) => ({ id: `sig_${id}`, styles: [style], name, seq, bonus, rarity: 'signature' })
export const BRANCHES = {
  pro: [
    { key: 'pressure', name: 'Pressure fighter', blurb: 'Walks through shots, works the body', tiers: [
      { name: 'Come forward', what: '+8% stepping in, +10% knock-back', mul: { walk: 1.08, push: 1.1 } },
      { name: 'Body attack', what: 'Kick tap throws a body hook; -5% damage taken', moves: { lk: 'bodyhook' }, mul: { dmgTaken: 0.95 } },
      { name: 'Signature: 3 · 3 · 2', what: 'Body hook, hook, cross', combo: sig('pro', 'pressure', 'Pressure 3 · 3 · 2', ['mk', 'hp', 'mp'], 2.1) } ] },
    { key: 'outboxer', name: 'Out-boxer', blurb: 'Jab, range and movement', tiers: [
      { name: 'Range', what: '+6% reach, +10% backing-off speed', mul: { reach: 1.06, backWalk: 1.1 } },
      { name: 'Sharp jab', what: 'Strikes 8% faster, +6% punch reach', mul: { startup: 0.92, punchReach: 1.06 } },
      { name: 'Signature: 1 · 1 · 2 · 6', what: 'Double jab, cross, uppercut', combo: sig('pro', 'outboxer', 'Out-box 1 · 1 · 2 · 6', ['lp', 'lp', 'mp', 'hk'], 2.2) } ] },
    { key: 'counter', name: 'Counter-puncher', blurb: 'Slips and big counters', tiers: [
      { name: 'Make them miss', what: '+12% counter damage', mul: { counters: 1.12 } },
      { name: 'Sit down on it', what: '+12% timing damage, -10% stun taken', mul: { timing: 1.12, stunTaken: 0.9 } },
      { name: 'Signature: slip · 6 · 3', what: 'Step back, uppercut, overhand', combo: sig('pro', 'counter', 'Slip · 6 · 3', ['b', 'hk', 'hp'], 2.1) } ] },
  ],
  am: [
    { key: 'volume', name: 'Volume puncher', blurb: 'Long, fast combinations', tiers: [
      { name: 'Keep busy', what: '-10% recovery after strikes', mul: { recovery: 0.9 } },
      { name: 'Non-stop', what: 'Longer combo window, +10% super gain', add: { comboGap: 6 }, mul: { meterGain: 1.1 } },
      { name: 'Signature: 1 · 2 · 1 · 2 · 3', what: 'Five-punch flurry', combo: sig('am', 'volume', '1 · 2 · 1 · 2 · 3', ['lp', 'mp', 'lp', 'mp', 'hp'], 2.3) } ] },
    { key: 'points', name: 'Point scorer', blurb: 'Clean single shots, quick exits', tiers: [
      { name: 'First to score', what: '+12% damage on the opening strike', mul: { opener: 1.12 } },
      { name: 'In and out', what: 'Strikes 8% faster, +8% backing-off speed', mul: { startup: 0.92, backWalk: 1.08 } },
      { name: 'Signature: 1 · 2 · body 3', what: 'Jab, cross, body hook', combo: sig('am', 'points', '1 · 2 · Body 3', ['lp', 'mp', 'mk'], 2.0) } ] },
    { key: 'switch', name: 'Switch-hitter', blurb: 'Changes angles mid-combo', tiers: [
      { name: 'Both sides', what: '+6% punch damage', mul: { punchDmg: 1.06 } },
      { name: 'Seamless', what: 'Chain into the next strike sooner', add: { chainEarly: 2 } },
      { name: 'Signature: 3 · 6 · 3', what: 'Hook, uppercut, hook', combo: sig('am', 'switch', 'Switch 3 · 6 · 3', ['hp', 'hk', 'hp'], 2.1) } ] },
  ],
  kickboxer: [
    { key: 'striker', name: 'Striker', blurb: 'Punches and kicks flow together', tiers: [
      { name: 'Mix it up', what: '+10% combo damage', mul: { comboBonus: 1.1 } },
      { name: 'Flow state', what: 'Chain into the next strike sooner', add: { chainEarly: 2 } },
      { name: 'Signature: 1 · 2 · 3 · roundhouse', what: 'Three punches into a body kick', combo: sig('kickboxer', 'striker', '1 · 2 · 3 · Roundhouse', ['lp', 'mp', 'hp', 'mk'], 2.2) } ] },
    { key: 'kicker', name: 'Kicker', blurb: 'Long-range kicks', tiers: [
      { name: 'Long legs', what: '+8% kick reach', mul: { kickReach: 1.08 } },
      { name: 'Side kick', what: 'Kick hold throws a side kick; +8% kick damage', moves: { mk: 'sidekick' }, mul: { kickDmg: 1.08 } },
      { name: 'Signature: teep · side · high', what: 'Teep, side kick, high kick', combo: sig('kickboxer', 'kicker', 'Teep · Side · High', ['lk', 'mk', 'hk'], 2.1) } ] },
    { key: 'showman', name: 'Showman', blurb: 'Jumping and spinning finishes', tiers: [
      { name: 'Air time', what: '+12% jump, +10% super damage', mul: { jump: 1.12, superDmg: 1.1 } },
      { name: 'Spin to win', what: 'Long-hold kick throws a spinning kick; +15% super gain', moves: { hk: 'spinkick' }, mul: { meterGain: 1.15 } },
      { name: 'Signature: jab · spin', what: 'Jab straight into a spinning kick', combo: sig('kickboxer', 'showman', 'Jab · Spin Kick', ['lp', 'hk'], 2.0) } ] },
  ],
  tkd: [
    { key: 'sparring', name: 'Sparring', blurb: 'Fast round kicks, points', tiers: [
      { name: 'Quick feet', what: 'Strikes 8% faster', mul: { startup: 0.92 } },
      { name: 'Reset fast', what: '-10% recovery after strikes', mul: { recovery: 0.9 } },
      { name: 'Signature: round ×4', what: 'Four round kicks', combo: sig('tkd', 'sparring', 'Round ×4', ['lk', 'lk', 'lk', 'lk'], 2.3) } ] },
    { key: 'power', name: 'Power breaking', blurb: 'Heavy spinning kicks', tiers: [
      { name: 'Board breaker', what: '+10% kick damage', mul: { kickDmg: 1.1 } },
      { name: 'Full rotation', what: '+10% long-hold damage, +10% knock-back', mul: { heavyHold: 1.1, push: 1.1 } },
      { name: 'Signature: side · spinning', what: 'Side kick into spinning kick', combo: sig('tkd', 'power', 'Side · Spinning', ['mk', 'hk'], 2.2) } ] },
    { key: 'footwork', name: 'Footwork', blurb: 'Hop-ins and cut kicks', tiers: [
      { name: 'Light on the feet', what: '+8% stepping in and backing off', mul: { walk: 1.08, backWalk: 1.08 } },
      { name: 'Hop-in', what: '+10% jump, longer combo window', mul: { jump: 1.1 }, add: { comboGap: 4 } },
      { name: 'Signature: cut · round · round', what: 'Cut kick, two round kicks', combo: sig('tkd', 'footwork', 'Cut · Round · Round', ['mk', 'lk', 'lk'], 2.1) } ] },
  ],
  thai: [
    { key: 'lowkick', name: 'Low-kick specialist', blurb: 'Chops the legs', tiers: [
      { name: 'Shin of steel', what: '+8% kick damage', mul: { kickDmg: 1.08 } },
      { name: 'Chop', what: 'Kick tap throws a low kick', moves: { lk: 'lowkick' } },
      { name: 'Signature: 1 · low · low', what: 'Jab, two low kicks', combo: sig('thai', 'lowkick', '1 · Low · Low', ['lp', 'lk', 'mk'], 2.1) } ] },
    { key: 'knee', name: 'Knee fighter', blurb: 'Clinch knees', tiers: [
      { name: 'Clinch', what: '+8% long-hold damage', mul: { heavyHold: 1.08 } },
      { name: 'Knee on hold', what: 'Kick hold throws a knee; -8% knock-back taken', moves: { mk: 'knee' }, mul: { knockTaken: 0.92 } },
      { name: 'Signature: knee ×3', what: 'Three knees', combo: sig('thai', 'knee', 'Knee · Knee · Knee', ['hk', 'hk', 'hk'], 2.2) } ] },
    { key: 'hands', name: 'Hands-first', blurb: 'Heavy hooks into kicks', tiers: [
      { name: 'Heavy hands', what: '+8% punch damage', mul: { punchDmg: 1.08 } },
      { name: 'Bombs', what: '+10% heavy-punch damage, strikes 4% faster', mul: { heavyPunch: 1.1, startup: 0.96 } },
      { name: 'Signature: 1 · 2 · 3 · 2 · low', what: 'Four punches into a low kick', combo: sig('thai', 'hands', '1 · 2 · 3 · 2 · Low', ['lp', 'mp', 'hp', 'mp', 'mk'], 2.4) } ] },
  ],
}
RARITY.signature = { name: 'Signature', colour: '#F5C542' }

// apply a fighter's branch (state: { branch, tier }) to its def: modifiers, button changes, signature combo
export function applyBranch(def, state) {
  const br = state && state.branch && (BRANCHES[def.style] || []).find(b => b.key === state.branch)
  if (!br || !state.tier) return def
  const mods = { ...(def.mods || {}) }, moves = { ...(def.moves || {}) }, combos = [...(def.combos || [])]
  for (const t of br.tiers.slice(0, Math.min(3, state.tier))) {
    for (const [k, v] of Object.entries(t.mul || {})) mods[k] = (mods[k] ?? 1) * v
    for (const [k, v] of Object.entries(t.add || {})) mods[k] = (mods[k] ?? 0) + v
    Object.assign(moves, t.moves || {})
    if (t.combo) combos.push({ ...t.combo, level: 1 })
  }
  return { ...def, mods, moves, combos, branch: br.key, branchName: br.name, branchTier: state.tier }
}

// seasons for Change Tokens: one token per quarter (Jan, Apr, Jul, Oct)
export const seasonOf = (d = new Date()) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`

// ---- Collecting: graphic cards and skins ----
// 20 graphic cards: one of each rarity per fighter. pose = how the fighter is drawn on the card.
export const CARD_RARITY = {
  common: { name: 'Common', colour: '#9AA3AE', weight: 10 },
  rare: { name: 'Rare', colour: '#4DA3FF', weight: 5 },
  epic: { name: 'Epic', colour: '#C93BFF', weight: 2 },
  legendary: { name: 'Legendary', colour: '#F5C542', weight: 0.6 }, // gold = legendary
}
export const CARD_RARITIES = ['common', 'rare', 'epic', 'legendary']
export const CARDS = FIGHTERS.flatMap(f => [
  { id: `card_${f.key}_common`, fighter: f.key, rarity: 'common', name: 'Stance', pose: 'stance' },
  { id: `card_${f.key}_rare`, fighter: f.key, rarity: 'rare', name: f.specialName, pose: 'special' },
  { id: `card_${f.key}_epic`, fighter: f.key, rarity: 'epic', name: SUPER_NAME[f.special], pose: 'kick' },
  { id: `card_${f.key}_legendary`, fighter: f.key, rarity: 'legendary', name: 'Champion', pose: 'victory' },
])
export const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]))
export const CARD_MAX_LV = 3

// Skins: finishes for each fighter, unlocked by collecting that fighter's cards. Shown in the 3D fight /
// previews and in the Stickman look.
export const SKINS = [
  { key: 'standard', name: 'Standard', need: 0, what: 'Chrome in the fighter\'s colour' },
  { key: 'matte', name: 'Matte', need: 0, what: 'Soft, non-reflective finish' },
  { key: 'neon', name: 'Neon', need: 2, what: 'Glows in the fighter\'s colour' },
  { key: 'obsidian', name: 'Obsidian', need: 3, what: 'Black glass with a coloured edge' },
  { key: 'gold', name: 'Gold', need: 'legendary', what: 'Solid gold' },
]
export const SKIN_BY_KEY = Object.fromEntries(SKINS.map(s => [s.key, s]))
