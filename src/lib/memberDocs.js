import { supabase } from './supabase.js'

// Signed membership documents live in the PRIVATE 'membership-docs' storage, as <member id>/<file>.
// document_url holds a reference like 'private:membership-docs/<member id>/<file>' -- not a public
// link. Opening one asks for a one-minute signed link, which only works for people allowed to see
// that member (staff, their head coach, their parent, themselves). Older documents still have a
// plain public link and keep working until they're moved (Settings -> Move membership documents).
const BUCKET = 'membership-docs'
const PREFIX = `private:${BUCKET}/`
export const isPrivateDoc = ref => typeof ref === 'string' && ref.startsWith(PREFIX)

export async function uploadMemberDoc(memberId, file) {
  const safe = (file.name || 'document').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${memberId}/${Date.now()}-${safe}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (error) throw error
  return PREFIX + path
}

// A URL that can be opened right now (signed for private documents)
export async function docUrl(ref) {
  if (!ref) return null
  if (!isPrivateDoc(ref)) return ref
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ref.slice(PREFIX.length), 60)
  if (error) throw error
  return data.signedUrl
}

// Open (and optionally print) a document. Opens the tab first so phone browsers don't block it.
export async function openMemberDoc(ref, { print = false } = {}) {
  const w = window.open('', '_blank')
  try {
    const url = await docUrl(ref)
    if (w) { w.location.href = url; if (print) setTimeout(() => { try { w.print() } catch { /* ignore */ } }, 1500) }
    else window.location.href = url
  } catch (e) {
    if (w) w.close()
    alert("Couldn't open the document: " + (e.message || e))
  }
}

// Move one older public document into private storage. Returns the new reference.
export async function movePublicDocToPrivate(memberId, publicUrl) {
  const res = await fetch(publicUrl)
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  const blob = await res.blob()
  const name = decodeURIComponent(publicUrl.split('/').pop().split('?')[0]) || 'document'
  const file = new File([blob], name.replace(/^[0-9a-f-]{36}-\d+-/i, ''), { type: blob.type })
  const ref = await uploadMemberDoc(memberId, file)
  // remove the old public copy (only files in athlete-media/membership-forms/)
  const m = publicUrl.match(/\/storage\/v1\/object\/public\/athlete-media\/(membership-forms\/[^?]+)/)
  if (m) await supabase.storage.from('athlete-media').remove([decodeURIComponent(m[1])])
  return ref
}
