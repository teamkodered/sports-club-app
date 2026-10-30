import { supabase } from './supabase.js'

// Save a setting, trying again if the phone's connection drops for a moment
// ("Failed to fetch" = the request never reached the server, so nothing was saved).
export async function saveSetting(key, value, tries = 3) {
  let last = null
  for (let i = 0; i < tries; i++) {
    try {
      const { error } = await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' })
      if (!error) return null
      last = error
      if (!/fetch|network|timeout|load failed/i.test(error.message || '')) return error   // a real error: don't retry
    } catch (e) { last = e }
    await new Promise(r => setTimeout(r, 800 * (i + 1)))
  }
  return last
}

export const saveErrorText = e => /fetch|network|load failed/i.test(e?.message || '')
  ? 'No connection just now — not saved. Check your signal / Wi-Fi and try again.'
  : (e?.message || String(e))
