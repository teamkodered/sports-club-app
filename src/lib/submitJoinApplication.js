import { supabase } from './supabase.js'

// SAVE FIRST, PROCESS SECOND.
// Every join-form submission is first saved as a plain copy of the answers
// (join_applications), then the member / student / membership form are created
// from that copy -- all inside the receive_join_application database function.
// If creating the member fails, the answers are still safe and staff complete
// it from the Forms page, so the applicant still sees "application received".
//
// The only case the applicant sees a problem is when their request can't
// reach the server at all (no signal) -- it's retried automatically first.

const RETRY_DELAYS_MS = [1000, 2500, 5000]
const pendingIds = new Map() // same submission retried = same id, never saved twice

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Checks before sending -- tells the applicant what to fix instead of failing later
export function validateJoinApplication(member) {
  const problems = []
  if (!member.first_name?.trim()) problems.push('first name')
  if (!member.last_name?.trim()) problems.push('surname')
  if (!member.email?.trim() || !EMAIL_RE.test(member.email.trim())) problems.push('a valid email address')
  const dob = member.date_of_birth
  if (!dob || isNaN(new Date(dob + 'T12:00:00')) || dob > new Date().toISOString().slice(0, 10)) problems.push('a valid date of birth')
  if (problems.length) throw new Error(`Please check: ${problems.join(', ')}.`)
}

const isNetworkError = err =>
  !err?.code && /fetch|network|load failed|timeout|abort/i.test(err?.message || String(err || ''))

const isMissingFunction = err =>
  err?.code === 'PGRST202' || /could not find the function/i.test(err?.message || '')

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function submitJoinApplication({ member, student, form }) {
  validateJoinApplication(member)
  const formType = form?.form_type || null
  const key = `${formType}:${member.member_id}:${(member.email || '').toLowerCase()}`
  if (!pendingIds.has(key)) pendingIds.set(key, crypto.randomUUID())
  const id = pendingIds.get(key)

  let lastErr = null
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1])
    try {
      const { data, error } = await supabase.rpc('receive_join_application', {
        p_id: id, p_form_type: formType, p_member: member, p_student: student, p_form: form,
      })
      if (!error) {
        // Saved. Whether it was fully processed or is waiting for staff, the
        // applicant's part is done.
        pendingIds.delete(key)
        return data
      }
      if (isMissingFunction(error)) return await legacySubmit({ member, student, form })
      lastErr = error
      if (!isNetworkError(error)) break
    } catch (err) {
      lastErr = err
      if (!isNetworkError(err)) break
    }
  }
  console.error('Join application could not be sent:', lastErr)
  throw new Error("We couldn't reach our system just now. Please check your internet connection and tap Submit again — your answers are still here.")
}

// Used only if the save-first SQL hasn't been installed yet
async function legacySubmit({ member, student, form }) {
  const { error } = await supabase.rpc('submit_join_application', { p_member: member, p_student: student, p_form: form })
  if (!error) return { status: 'completed' }
  if (/ALREADY_REGISTERED/.test(error.message || '')) {
    throw new Error('It looks like you are already registered with us (same name and date of birth). Please contact us if you need help, rather than submitting a new form.')
  }
  throw error
}
