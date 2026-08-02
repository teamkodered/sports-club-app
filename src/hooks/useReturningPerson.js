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
      // members/students is the reliable source for contact details --
      // membership_forms only stores form-specific answers (goals,
      // medical, waiver etc), not necessarily address/phone. But it
      // does hold emergency contact details, which aren't stored on
      // members/students at all -- so fetch that too, from this
      // person's most recent form submission, for household/sibling
      // linking (e.g. reusing the same emergency contact for a
      // second child in the same family).
      const { data } = await supabase
        .from('members')
        .select('*, students(*)')
        .ilike('email', trimmed)
        .order('joined_date', { ascending: false })
        .limit(1)
      let emergencyContact = null
      if (data && data.length) {
        const { data: forms } = await supabase
          .from('membership_forms')
          .select('emergency_contact_name, emergency_contact_phone')
          .eq('member_id', data[0].id)
          .order('submitted_at', { ascending: false })
          .limit(1)
        if (forms && forms.length && (forms[0].emergency_contact_name || forms[0].emergency_contact_phone)) {
          emergencyContact = forms[0]
        }
      }
      setChecking(false)
      if (data && data.length) {
        setMatch({ ...data[0], emergencyContact })
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
