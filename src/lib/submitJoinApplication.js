import { supabase } from './supabase.js'

const ALREADY_REGISTERED_MSG = 'It looks like you are already registered with us (same name and date of birth). Please contact us if you need help, rather than submitting a new form.'

// Saves a join-form application: member + student + membership form.
// Uses the submit_join_application database function, which saves all three
// together (all or nothing) and finishes any half-saved earlier attempt
// instead of failing with a duplicate member_id error. Falls back to the old
// three separate inserts if that function hasn't been installed yet.
export async function submitJoinApplication({ member, student, form }) {
  const { data, error } = await supabase.rpc('submit_join_application', {
    p_member: member, p_student: student, p_form: form,
  })
  if (!error) return data
  if (/ALREADY_REGISTERED/.test(error.message || '')) throw new Error(ALREADY_REGISTERED_MSG)
  const missingFn = error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message || '')
  if (!missingFn) throw error

  // Fallback: old behaviour, with a clearer duplicate message
  const memberId = member.id || crypto.randomUUID()
  const { error: mErr } = await supabase.from('members').insert({ ...member, id: memberId })
  if (mErr) {
    if (mErr.code === '23505' && /member_id/.test(mErr.message || '')) throw new Error(ALREADY_REGISTERED_MSG)
    throw mErr
  }
  const { error: sErr } = await supabase.from('students').insert({ ...student, member_id: memberId })
  if (sErr) throw sErr
  if (form) {
    const { error: mfErr } = await supabase.from('membership_forms').insert({ ...form, member_id: memberId })
    if (mfErr) console.error('Error saving membership_forms entry:', mfErr)
  }
  return memberId
}
