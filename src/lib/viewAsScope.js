import { supabase } from './supabase.js'

// Admin "View as" preview: the admin's own database access is unchanged underneath, so pages that
// list data the database would limit for that person need narrowing in the app to match.
// Returns, for the person being viewed: { venues: Set('derby-moore'|'moorways'), venueMemberIds: Set }
// (Head Coach: from their Derby Moore / Moorways classes; anyone else: empty -- no forms at all).
export async function viewAsVenueScope(viewAs) {
  if (!viewAs) return null
  if (viewAs.role !== 'head_coach') return { venues: new Set(), venueMemberIds: new Set() }
  const classIds = viewAs.access?.registers?.classes || []
  if (!classIds.length) return { venues: new Set(), venueMemberIds: new Set() }
  const { data } = await supabase.from('student_class_assignments').select('class_id, classes(name), students(member_id)').in('class_id', classIds)
  const { data: cls } = await supabase.from('classes').select('id, name').in('id', classIds)
  const venueOf = n => /derby moore/i.test(n || '') ? 'derby-moore' : /moorway/i.test(n || '') ? 'moorways' : null
  const venues = new Set((cls || []).map(c => venueOf(c.name)).filter(Boolean))
  const venueMemberIds = new Set((data || []).filter(r => venueOf(r.classes?.name)).map(r => r.students?.member_id).filter(Boolean))
  return { venues, venueMemberIds }
}
