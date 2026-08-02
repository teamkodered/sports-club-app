import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const DRAFT_MAX_AGE_DAYS = 30
const AUTOSAVE_DEBOUNCE_MS = 1500

function randomToken() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

/**
 * Save-and-resume for long public forms (membership join forms etc).
 *
 * Usage:
 *   const draft = useFormDraft('pka_child', form, setForm, step, setStep)
 *
 * - Autosaves `form` (and `step`, if provided) in the background as
 *   the person types/steps through, debounced, to a `form_drafts` row
 *   keyed by an unguessable token (never by email/name), so a draft
 *   is only ever resumable by whoever has the exact link/token.
 * - On mount, checks for a token in the URL (?draft=...) or in this
 *   browser's localStorage for this form type. If a matching,
 *   non-expired draft is found, `draft.hasPendingResume` is true and
 *   the person should be shown a prompt -- never auto-applied
 *   silently.
 * - `draft.resume()` applies the saved data via setForm/setStep.
 * - `draft.discard()` clears it and starts a fresh draft.
 * - `draft.clearOnSubmit()` should be called after a successful
 *   final submission, so the draft doesn't linger.
 * - `draft.resumeLink` is a shareable URL encoding the token, for a
 *   "copy link to finish later" button.
 */
export function useFormDraft(formType, form, setForm, step, setStep) {
  const storageKey = `form_draft_token_${formType}`
  const tokenRef = useRef(null)
  const [pendingDraftData, setPendingDraftData] = useState(null) // draft found on load, awaiting the person's choice
  const [pendingStep, setPendingStep] = useState(0)
  const [hasPendingResume, setHasPendingResume] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const skipNextAutosave = useRef(true) // don't autosave on the very first render before anything's typed
  const resumeDecisionMade = useRef(false) // don't autosave while a resume prompt is still awaiting a decision

  // On mount: figure out which token to use, and check for existing data
  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get('draft')
    const storedToken = urlToken || localStorage.getItem(storageKey)

    if (storedToken) {
      tokenRef.current = storedToken
      localStorage.setItem(storageKey, storedToken)
      supabase.from('form_drafts').select('*').eq('draft_token', storedToken).eq('form_type', formType).maybeSingle()
        .then(({ data }) => {
          if (!data) { resumeDecisionMade.current = true; return }
          const ageMs = Date.now() - new Date(data.updated_at).getTime()
          const isExpired = ageMs > DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
          const hasContent = data.data && Object.values(data.data).some(v =>
            Array.isArray(v) ? v.length > 0 : (typeof v === 'boolean' ? v : !!v)
          )
          if (isExpired || !hasContent) {
            resumeDecisionMade.current = true
            return
          }
          setPendingDraftData(data.data)
          setPendingStep(typeof data.step === 'number' ? data.step : 0)
          setHasPendingResume(true)
        })
    } else {
      tokenRef.current = randomToken()
      localStorage.setItem(storageKey, tokenRef.current)
      resumeDecisionMade.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave, debounced, whenever `form` changes
  useEffect(() => {
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return }
    if (!resumeDecisionMade.current) return // don't overwrite a draft still awaiting resume/discard
    if (!tokenRef.current) return

    const timer = setTimeout(async () => {
      setSavingDraft(true)
      await supabase.from('form_drafts').upsert({
        draft_token: tokenRef.current,
        form_type: formType,
        data: form,
        step: typeof step === 'number' ? step : 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'draft_token' })
      setSavingDraft(false)
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, step])

  const resume = useCallback(() => {
    if (pendingDraftData) setForm(f => ({ ...f, ...pendingDraftData }))
    if (setStep) setStep(pendingStep)
    resumeDecisionMade.current = true
    setHasPendingResume(false)
    setPendingDraftData(null)
  }, [pendingDraftData, pendingStep, setForm, setStep])

  const discard = useCallback(async () => {
    if (tokenRef.current) await supabase.from('form_drafts').delete().eq('draft_token', tokenRef.current)
    tokenRef.current = randomToken()
    localStorage.setItem(storageKey, tokenRef.current)
    resumeDecisionMade.current = true
    setHasPendingResume(false)
    setPendingDraftData(null)
  }, [storageKey])

  const clearOnSubmit = useCallback(async () => {
    if (tokenRef.current) await supabase.from('form_drafts').delete().eq('draft_token', tokenRef.current)
    localStorage.removeItem(storageKey)
  }, [storageKey])

  const resumeLink = tokenRef.current
    ? `${window.location.origin}${window.location.pathname}?draft=${tokenRef.current}`
    : ''

  return { hasPendingResume, resume, discard, clearOnSubmit, resumeLink, savingDraft }
}
