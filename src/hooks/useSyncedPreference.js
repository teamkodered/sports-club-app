import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from './useAuth.jsx'

// A useState-shaped hook for a UI preference (tab order, column
// visibility, zoom level, a toggled-off chart series, a saved date
// range...) that follows the logged-in staff member across their own
// devices, rather than being stuck on whichever single browser first
// set it.
//
// Reads localStorage immediately for an instant value before the
// user's profile has loaded (avoids a flash of default settings on
// every page load), then applies the database's value once the
// profile arrives -- the database is the actual source of truth for
// cross-device sync, localStorage is just there for that instant
// first paint and as a fallback if there's no logged-in profile at
// all (e.g. the public/kiosk-style views).
//
// All synced preferences for one person live together in one JSONB
// column (members.synced_settings), each hook call reading/writing
// its own `key` within that shared object, rather than needing a new
// database column added every time another setting is made to sync --
// this is exactly why a single generic hook exists instead of writing
// the same load/merge/save logic out by hand at every call site.
export function useSyncedPreference(key, defaultValue) {
  const { profile } = useAuth()
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved != null ? JSON.parse(saved) : defaultValue
    } catch { return defaultValue }
  })
  const appliedFromProfileRef = useRef(false)

  // Applies the profile's saved value once it actually finishes
  // loading -- the profile starts out null while that request is in
  // flight, so the useState initializer above may already have fallen
  // back to localStorage or the default before the real synced value
  // was available.
  useEffect(() => {
    if (appliedFromProfileRef.current) return
    if (profile?.synced_settings && key in profile.synced_settings) {
      appliedFromProfileRef.current = true
      setValue(profile.synced_settings[key])
    } else if (profile) {
      // Profile has loaded but has no saved value for this key yet --
      // stop waiting so a later profile refresh doesn't unexpectedly
      // override a value the user has since changed locally.
      appliedFromProfileRef.current = true
    }
  }, [profile, key])

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full/unavailable -- local fallback only, not fatal */ }
    if (!profile?.id) return
    // Merges atomically in the database (via an RPC doing
    // synced_settings || jsonb_build_object(key, value)) rather than
    // reading the local profile object, merging client-side and
    // writing the whole thing back -- with several different
    // useSyncedPreference calls active on the same page at once (e.g.
    // register_cols and register_zoom together on Registers.jsx), each
    // one's local copy of profile.synced_settings can be stale by the
    // time it saves, so a naive client-side merge risked one hook's
    // save silently overwriting another's.
    supabase.rpc('merge_member_synced_setting', { p_member_id: profile.id, p_key: key, p_value: value }).then(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return [value, setValue]
}
