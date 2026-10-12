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

export const FIGHTERS = [
  { key: 'mentality', name: 'MENTALITY', colour: '#22B14C', trim: '#0E5F27', speed: 4.2, power: 1.0, reach: 1.0, special: 'wave', specialName: 'Focus Wave', combos: [{ name: 'Jab · Jab · Cross', seq: ['lp', 'lp', 'mp'], bonus: 1.6 }, { name: 'Teep · Cross · Hook', seq: ['lk', 'mp', 'hp'], bonus: 1.7 }, { name: 'Jab · High Kick · Focus Wave', seq: ['lp', 'hk', 'sp'], bonus: 1.5 }] },
  { key: 'technical', name: 'TECHNICAL', colour: '#2F6BFF', trim: '#13306F', speed: 4.6, power: 0.95, reach: 1.05, special: 'rush', specialName: 'Combo Rush', combos: [{ name: 'Jab · Cross · Hook', seq: ['lp', 'mp', 'hp'], bonus: 1.6 }, { name: 'Jab · Body Kick · High Kick', seq: ['lp', 'mk', 'hk'], bonus: 1.7 }, { name: 'Jab Blitz', seq: ['lp', 'lp', 'lp', 'lp'], bonus: 2.0 }] },
  { key: 'tactical', name: 'TACTICAL', colour: '#FF2A2A', trim: '#6F1010', speed: 4.3, power: 1.0, reach: 1.0, special: 'counter', specialName: 'Counter', combos: [{ name: 'Step Back · Cross · Hook', seq: ['b', 'mp', 'hp'], bonus: 1.7 }, { name: 'Jab Feint · High Kick', seq: ['lp', 'f', 'hk'], bonus: 1.7 }, { name: 'Teep · Teep · Cross', seq: ['lk', 'lk', 'mp'], bonus: 1.6 }] },
  { key: 'physical', name: 'PHYSICAL', colour: '#E6B800', trim: '#6A5400', speed: 3.8, power: 1.2, reach: 0.95, special: 'upper', specialName: 'Power Uppercut', combos: [{ name: 'Cross · Hook · Hook', seq: ['mp', 'hp', 'hp'], bonus: 1.5 }, { name: 'Duck · Cross · Hook', seq: ['d', 'mp', 'hp'], bonus: 1.7 }, { name: 'Charge · Hook', seq: ['f', 'f', 'hp'], bonus: 1.8 }] },
  { key: 'foundation', name: 'FOUNDATION', colour: '#C93BFF', trim: '#55157A', speed: 3.9, power: 1.05, reach: 1.0, special: 'quake', specialName: 'Shockwave', combos: [{ name: 'Teep · Body Kick · High Kick', seq: ['lk', 'mk', 'hk'], bonus: 1.7 }, { name: 'Sweep · Hook', seq: ['d', 'lk', 'hp'], bonus: 1.7 }, { name: 'Jab · Teep · Cross · High Kick', seq: ['lp', 'lk', 'mp', 'hk'], bonus: 1.9 }] },
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
  kickboxer: { name: 'Kickboxer', blurb: 'All-rounder: punches and kicks flow together', speed: 1, power: 1, reach: 1,
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
  thai: { name: 'Muay Thai', blurb: 'Low kicks, knees and elbows: short range, punishing', speed: 0.96, power: 1.1, reach: 0.95,
    moves: { lp: 'jab', mp: 'cross', hp: 'elbow', lk: 'teep', mk: 'lowkick', hk: 'knee' },
    combos: [{ name: 'Jab · Cross · Low Kick', seq: ['lp', 'mp', 'mk'], bonus: 1.7 }, { name: 'Teep · Elbow · Knee', seq: ['lk', 'hp', 'hk'], bonus: 1.8 }, { name: 'Low Kick · Low Kick · Elbow', seq: ['mk', 'mk', 'hp'], bonus: 1.6 }] },
}
export const STYLE_KEYS = ['kickboxer', 'pro', 'am', 'tkd', 'thai']
// a pillar fighter in a style: same colours / special / super, style's moves, combos and stat changes
export function styledDef(base, styleKey) {
  const st = STYLES[styleKey] || STYLES.kickboxer
  return { ...base, style: styleKey, styleName: st.name, speed: base.speed * st.speed, power: base.power * st.power, reach: base.reach * st.reach,
    moves: st.moves, combos: st.combos, startup: st.startup || 0, punchPower: st.punchPower || 1 }
}
// squad set-up (style per pillar + fight order), remembered on the device for now
export function loadSquad() {
  try { const v = JSON.parse(localStorage.getItem('krfight-squad') || 'null'); if (v && v.styles && Array.isArray(v.order)) return v } catch (e) { /* ignore */ }
  return { styles: { physical: 'pro', technical: 'kickboxer', tactical: 'thai', mentality: 'am', foundation: 'tkd' }, order: [0, 1, 2] }
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
