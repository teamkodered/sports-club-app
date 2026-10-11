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
  { key: 'mentality', name: 'MENTALITY', colour: '#22B14C', trim: '#0E5F27', speed: 4.2, power: 1.0, reach: 1.0, special: 'wave', specialName: 'Focus Wave', combos: [{ name: 'Calm Storm', seq: ['lp', 'lp', 'hp'], bonus: 1.6 }, { name: 'Mind Lock', seq: ['d', 'lk', 'hk'], bonus: 1.7 }, { name: 'Focus Chain', seq: ['lp', 'hk', 'sp'], bonus: 1.5 }] },
  { key: 'technical', name: 'TECHNICAL', colour: '#2F6BFF', trim: '#13306F', speed: 4.6, power: 0.95, reach: 1.05, special: 'rush', specialName: 'Combo Rush', combos: [{ name: '1-2-Hook', seq: ['lp', 'lp', 'hp'], bonus: 1.5 }, { name: 'Teep & Cross', seq: ['lk', 'lp', 'hk'], bonus: 1.7 }, { name: 'Blitz', seq: ['lp', 'lp', 'lp', 'lp'], bonus: 2.0 }] },
  { key: 'tactical', name: 'TACTICAL', colour: '#FF2A2A', trim: '#6F1010', speed: 4.3, power: 1.0, reach: 1.0, special: 'counter', specialName: 'Counter', combos: [{ name: 'Check & Counter', seq: ['b', 'lp', 'hp'], bonus: 1.7 }, { name: 'Feint Kick', seq: ['lp', 'f', 'hk'], bonus: 1.7 }, { name: 'Ring Cutter', seq: ['lk', 'lk', 'hp'], bonus: 1.6 }] },
  { key: 'physical', name: 'PHYSICAL', colour: '#E6B800', trim: '#6A5400', speed: 3.8, power: 1.2, reach: 0.95, special: 'upper', specialName: 'Power Uppercut', combos: [{ name: 'Bulldozer', seq: ['hp', 'hp', 'hk'], bonus: 1.5 }, { name: 'Body Breaker', seq: ['d', 'hp', 'hp'], bonus: 1.7 }, { name: 'Power Drive', seq: ['f', 'f', 'hp'], bonus: 1.8 }] },
  { key: 'foundation', name: 'FOUNDATION', colour: '#C93BFF', trim: '#55157A', speed: 3.9, power: 1.05, reach: 1.0, special: 'quake', specialName: 'Shockwave', combos: [{ name: 'Ground Pound', seq: ['lk', 'lk', 'hk'], bonus: 1.6 }, { name: 'Anchor', seq: ['d', 'lk', 'hp'], bonus: 1.7 }, { name: 'Rooted Rush', seq: ['lp', 'lk', 'hp', 'hk'], bonus: 1.9 }] },
]

// startup / active / recovery frames, damage, reach (px), hit height: 'high' | 'mid' | 'low'
export const MOVES = {
  lp: { s: 3, a: 3, r: 7, dmg: 5, reach: 62, h: 'high', push: 4 },
  hp: { s: 7, a: 3, r: 14, dmg: 10, reach: 70, h: 'high', push: 8 },
  lk: { s: 5, a: 3, r: 9, dmg: 6, reach: 78, h: 'mid', push: 5 },
  hk: { s: 9, a: 4, r: 18, dmg: 12, reach: 92, h: 'mid', push: 10 },
  clp: { s: 3, a: 3, r: 8, dmg: 4, reach: 60, h: 'mid', push: 3 },
  clk: { s: 5, a: 3, r: 12, dmg: 7, reach: 90, h: 'low', push: 6 },
  jk: { s: 3, a: 8, r: 4, dmg: 9, reach: 70, h: 'high', push: 6 },
}

export const LEVELS = {
  easy: { react: 22, aggro: 0.3, block: 0.25, special: 0.002, smart: 0.25 },
  medium: { react: 10, aggro: 0.5, block: 0.55, special: 0.006, smart: 0.6 },
  hard: { react: 5, aggro: 0.65, block: 0.8, special: 0.012, smart: 0.9 },
}

const TOKEN = { f: '▶', b: '◀', d: '▼', lp: 'LP', hp: 'HP', lk: 'LK', hk: 'HK', sp: 'SP' }
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
