// Wearables activity filter: picked by default until the coach changes it (saved on the device)
export const DEFAULT_SPORTS = ['boxing', 'box fitness', 'boxing fitness', 'martial arts', 'kickboxing', 'kickboxing martial arts']
export function loadSportSel() {
  try { const v = localStorage.getItem('kc_wear_sports'); return v == null ? DEFAULT_SPORTS : JSON.parse(v) } catch { return DEFAULT_SPORTS }
}
export const sameSport = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
