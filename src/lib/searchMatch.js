// A single search box across the app typically checks whether the
// WHOLE typed query appears as one substring somewhere in a combined
// "name email phone ref" string. That works fine for a single word,
// but breaks down for a full name search the moment word order
// doesn't exactly match how the fields were concatenated -- searching
// "Piorkowski Anthony" (surname first) wouldn't find "Anthony
// Piorkowski", even though every word is genuinely there, just in a
// different order. It also can't combine a name with, say, a partial
// phone number typed afterwards.
//
// This instead splits the query into words and requires EVERY word to
// appear somewhere in the combined text, in any order -- so "Piorkowski
// Anthony", "Anthony Piorkowski", and "Anthony 07" (name + partial
// phone) all correctly match the same record.
export function matchesSearch(query, ...fields) {
  const q = (query || '').trim()
  if (!q) return true
  const haystack = fields.filter(Boolean).join(' ').toLowerCase()
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every(w => haystack.includes(w))
}
