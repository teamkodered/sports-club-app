import { supabase } from './supabase.js'

// Replaces a clip's "athletes in this fight" labels and its viewer list in
// one go. The viewer list (fight_footage_athletes) is only kept when the
// access mode is 'select_athletes' -- the database read rule only honours it
// in that mode anyway, so stale rows would just be confusing.
export async function saveFootageAthletes(footageId, { accessMode, featuredIds, viewerIds }) {
  const del1 = await supabase.from('fight_footage_featured').delete().eq('footage_id', footageId)
  if (del1.error) throw del1.error
  if (featuredIds?.size > 0) {
    const { error } = await supabase.from('fight_footage_featured').insert([...featuredIds].map(student_id => ({ footage_id: footageId, student_id })))
    if (error) throw error
  }
  const del2 = await supabase.from('fight_footage_athletes').delete().eq('footage_id', footageId)
  if (del2.error) throw del2.error
  if (accessMode === 'select_athletes' && viewerIds?.size > 0) {
    const { error } = await supabase.from('fight_footage_athletes').insert([...viewerIds].map(student_id => ({ footage_id: footageId, student_id })))
    if (error) throw error
  }
}

// Pre-selects athletes whose first or last name appears in a filename,
// e.g. "Jake_R2.mp4" or "regionals-smith-final.mov". Whole-word matches
// only, so "Al" doesn't match "Final". Only searches within `candidates`
// (the athletes picked for the batch), which keeps false matches rare.
export function guessAthletesFromFilename(fileName, candidates, nameOf) {
  const words = new Set(fileName.replace(/\.[^.]+$/, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  const hits = new Set()
  for (const s of candidates) {
    const parts = nameOf(s).toLowerCase().split(/\s+/).filter(p => p.length >= 2)
    if (parts.some(p => words.has(p))) hits.add(s.id)
  }
  return hits
}
