// Official age + weight divisions, used everywhere a division is chosen or read.
//  • Kickboxing: WAKO Age and Weight Categories 2025
//      tatami sports (Point Fighting, Light Contact, Kick Light): Children … Veterans
//      ring sports (Full Contact, Low Kick, K1): Young Juniors, Older Juniors, Seniors
//  • Boxing: England Boxing Technical & Competition Rules 2026 (championship weight categories)
// Ages are "competition age" = competition year − year of birth (both bodies go by year of birth).

export const KB_DIVISIONS = [
  { key: 'CH', label: 'Children (7-9)', min: 7, max: 9 },
  { key: 'YC', label: 'Younger Cadets (10-12)', min: 10, max: 12 },
  { key: 'OC', label: 'Older Cadets (13-15)', min: 13, max: 15 },
  { key: 'J', label: 'Juniors (16-18)', min: 16, max: 18 },
  { key: 'S', label: 'Seniors (19-40)', min: 19, max: 40 },
  { key: 'V', label: 'Veterans (41+)', min: 41, max: 120 },
  { key: 'YJ', label: 'Young Juniors (15-16) — ring', min: 15, max: 16, ring: true },
  { key: 'OJ', label: 'Older Juniors (17-18) — ring', min: 17, max: 18, ring: true },
  { key: 'RS', label: 'Seniors (19-40) — ring', min: 19, max: 40, ring: true },
]
export const BOX_DIVISIONS = [
  { key: 'MIN', label: 'Minors (10-11)', min: 10, max: 11 },
  { key: 'SCH', label: 'Schools (12-14)', min: 12, max: 14 },
  { key: 'JUN', label: 'Junior (15-16)', min: 15, max: 16 },
  { key: 'YTH', label: 'Youth (17-18)', min: 17, max: 18 },
  { key: 'SDV', label: 'Senior Development (19-40)', min: 19, max: 40 },
  { key: 'ELT', label: 'Elite (19-40)', min: 19, max: 40 },
]
// older labels still saved on profiles -> today's
const LEGACY = {
  'Children': 'CH', 'Younger Cadet (10-12)': 'YC', 'Older Cadet (13-15)': 'OC', 'Junior (16-18)': 'J', 'Senior (19-40)': 'S', 'Masters (40+)': 'V',
  'Schoolboy': 'SCH', 'Schoolgirl': 'SCH', 'Junior': 'JUN', 'Youth': 'YTH', 'Senior': 'SDV', 'Elite': 'ELT',
}
export const divisionKey = label => {
  if (!label) return null
  const all = [...KB_DIVISIONS, ...BOX_DIVISIONS]
  return all.find(d => d.label === label)?.key || LEGACY[label] || null
}
export const kbLabel = v => KB_DIVISIONS.find(d => d.key === divisionKey(v))?.label || v || ''
export const boxLabel = v => BOX_DIVISIONS.find(d => d.key === divisionKey(v))?.label || v || ''

// ── weights ── (upper limits in kg; "+" = the open top weight)
const k = (list, plus) => [...list.map(w => `-${w}kg`), `+${plus}kg`]
const TATAMI = {
  CH: { M: k([18, 21, 24, 27, 30, 33, 36], 36), F: k([18, 21, 24, 27, 30, 33, 36], 36) },
  YC: { M: k([28, 32, 37, 42, 47], 47), F: k([28, 32, 37, 42, 47], 47) },
  OC: { M: k([32, 37, 42, 47, 52, 57, 63, 69], 69), F: k([32, 37, 42, 46, 50, 55, 60, 65], 65) },
  J: { M: k([57, 63, 69, 74, 79, 84, 89, 94], 94), F: k([50, 55, 60, 65, 70], 70) },
  S: { M: k([57, 63, 69, 74, 79, 84, 89, 94], 94), F: k([50, 55, 60, 65, 70], 70) },
  V: { M: k([63, 74, 84, 94], 94), F: k([55, 65], 65) },
}
const RING = {
  YJ: { M: k([42, 45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81], 81), F: k([36, 40, 44, 48, 52, 56, 60], 60) },
  OJ: { M: k([51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91], 91), F: k([48, 52, 56, 60, 65, 70], 70) },
  RS: { M: k([51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91], 91), F: k([48, 52, 56, 60, 65, 70], 70) },
}
const u = (list, over) => [...list.map(w => (typeof w === 'string' ? w : `Under ${w}kg`)), `Over ${over}kg`]
const BOX = {
  // Minors box within 2kg of each other -- no fixed classes; Schools classes used as a guide
  MIN: { M: u(['28-30kg', 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 57, 60, 63, 66, 70, 75, 80, 90], 90), F: u(['28-30kg', 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 57, 60, 63, 66, 70, 75, 80], 80) },
  SCH: { M: u(['28-30kg', 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 57, 60, 63, 66, 70, 75, 80, 90], 90), F: u(['28-30kg', 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 57, 60, 63, 66, 70, 75, 80], 80) },
  JUN: { M: u([36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 57, 60, 63, 66, 70, 75, 80], 80), F: u([36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 57, 60, 63, 66, 70, 75, 80], 80) },
  YTH: { M: u(['45-47kg', 50, 52.5, 55, 57.5, 60, 62.5, 65, 70, 75, 80, 85, 90], 90), F: u(['43-45kg', 48, 51, 54, 57, 60, 62.5, 65, 67.5, 70, 75, 80], 80) },
  SDV: { M: u(['47-50kg', 52.5, 55, 57.5, 60, 62.5, 65, 70, 75, 80, 85, 90], 90), F: u(['45-48kg', 51, 54, 57, 60, 62.5, 65, 67.5, 70, 75, 80], 80) },
  ELT: { M: u(['47-50kg', 52.5, 55, 57.5, 60, 62.5, 65, 70, 75, 80, 85, 90], 90), F: u(['45-48kg', 51, 54, 57, 60, 62.5, 65, 67.5, 70, 75, 80], 80) },
}

// the official weights for a division (label or key) and sex ('M' / 'F'; unknown -> both, merged)
export function weightsFor(division, sex) {
  const key = divisionKey(division) || division
  const table = TATAMI[key] || RING[key] || BOX[key]
  if (!table) return []
  if (sex === 'M' || sex === 'F') return table[sex]
  return [...new Set([...table.M, ...table.F])].sort((a, b) => parseDivision(a).limit - parseDivision(b).limit)
}

// read any division text: "-54kg", "+94kg", "Under 54kg", "Over 80kg", "45-48kg", "54"
// -> { limit: upper limit in kg, plus: open top weight?, label }
export function parseDivision(text) {
  const t = String(text || '').trim()
  if (!t) return null
  const range = t.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/)
  if (range && !/^-/.test(t)) return { limit: parseFloat(range[2].replace(',', '.')), plus: false, label: t }
  const n = t.match(/(\d+(?:[.,]\d+)?)/)
  if (!n) return null
  const plus = /^\+|over|\+\s*\d/i.test(t)
  return { limit: parseFloat(n[1].replace(',', '.')), plus, label: t }
}

// the division a weight falls in (smallest limit at or above it; else the open top weight)
export function suggestDivision(weightKg, division, sex) {
  const w = parseFloat(weightKg); if (!w) return null
  const list = weightsFor(division, sex); if (!list.length) return null
  return list.find(d => { const p = parseDivision(d); return p && !p.plus && w <= p.limit }) || list.find(d => parseDivision(d)?.plus) || null
}

// is a saved division one of the official ones for that division + sex?
export const isOfficial = (text, division, sex) => weightsFor(division, sex).some(d => d.replace(/\s/g, '').toLowerCase() === String(text || '').replace(/\s/g, '').toLowerCase())

// which divisions an athlete is in this competition year (for suggestions)
export function divisionsForAge(dob, year = new Date().getFullYear()) {
  if (!dob) return { kickboxing: null, ring: null, boxing: null }
  const age = year - new Date(dob).getFullYear()
  const pick = (list, ring) => list.find(d => !!d.ring === ring && age >= d.min && age <= d.max) || null
  return { kickboxing: pick(KB_DIVISIONS, false), ring: pick(KB_DIVISIONS, true), boxing: BOX_DIVISIONS.find(d => age >= d.min && age <= d.max && d.key !== 'ELT') || null, age }
}

// same shape as the old  text.match(/([+-]?)\s*([\d.]+)/)  -> [text, sign, value] -- but reads
// "Under 54kg", "Over 80kg" and ranges ("45-48kg" -> 48) correctly
export function divMatch(text) {
  const p = parseDivision(text)
  return p ? [p.label, p.plus ? '+' : (/^\s*-/.test(p.label) ? '-' : ''), String(p.limit)] : null
}
