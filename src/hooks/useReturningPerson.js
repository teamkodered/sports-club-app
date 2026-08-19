import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CHECK_DEBOUNCE_MS = 600

/**
 * Detects whether an email entered on a membership form matches an
 * existing member (e.g. the same parent registering a second child,
 * or someone re-submitting after an earlier signup), and offers to
 * pre-fill only safe-to-share contact fields from it.
 *
 * Never applies anything automatically -- always requires an
 * explicit "yes, use those" from the person. Never surfaces
 * sensitive fields (medical info, waiver answers) from the previous
 * record, only contact-type fields (name, address, phone, guardian
 * details).
 *
 * Usage:
 *   const returning = useReturningPerson()
 *   // call returning.checkEmail(email) on blur/change (debounced)
 *   // returning.match holds the found member (with nested .students
 *   // record), or null
 *   // returning.dismiss() hides the prompt without applying anything
 */
export function useReturningPerson() {
  const [match, setMatch] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [checking, setChecking] = useState(false)
  const lastCheckedEmail = useRef('')
  const debounceTimer = useRef(null)

  const checkEmail = useCallback((email) => {
    clearTimeout(debounceTimer.current)
    const trimmed = (email || '').trim().toLowerCase()
    if (!EMAIL_RE.test(trimmed)) return
    if (trimmed === lastCheckedEmail.current) return

    debounceTimer.current = setTimeout(async () => {
      lastCheckedEmail.current = trimmed
      setChecking(true)
      // Uses a SECURITY DEFINER RPC (lookup_member_by_email) rather than
      // a raw table read -- this runs anonymously, before the person
      // has an account/session, so it can't rely on RLS auth checks.
      // The RPC deliberately returns only these few contact-prefill
      // fields, never the full members/students row (medical info,
      // DOB, etc never leave the database this way).
      const { data, error } = await supabase.rpc('lookup_member_by_email', { p_email: trimmed })
      setChecking(false)
      const row = data && data.length ? data[0] : null
      if (!error && row && row.member_exists) {
        setMatch({
          address_line1: row.address_line1,
          phone: row.phone,
          students: [{ guardian_name: row.guardian_name }],
          emergencyContact: (row.ec_name || row.ec_phone)
            ? { emergency_contact_name: row.ec_name, emergency_contact_phone: row.ec_phone }
            : null,
        })
        setDismissed(false)
      } else {
        setMatch(null)
      }
    }, CHECK_DEBOUNCE_MS)
  }, [])

  const dismiss = useCallback(() => setDismissed(true), [])

  return {
    match: dismissed ? null : match,
    checking,
    checkEmail,
    dismiss,
  }
}
