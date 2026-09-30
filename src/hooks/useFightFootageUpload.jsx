import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { saveFootageAthletes } from '../lib/fightFootageTags.js'

const FightFootageUploadContext = createContext(null)

// Lives at the app root (see main.jsx) rather than inside ViewIt.jsx
// itself, specifically so that starting an upload and then navigating
// to a different page doesn't lose track of it -- the XHR keeps
// running regardless (it's not tied to any component), but without
// this, the progress %, and the follow-up steps (creating the
// fight_footage row, tagging athletes) would have nowhere to live
// once the component that started them unmounts.
export function FightFootageUploadProvider({ children }) {
  const [upload, setUpload] = useState(null) // { title, current, total, progress, status: 'uploading'|'processing'|'done'|'error', error }

  const uploadSingleFile = useCallback(async (file, { title, description, accessMode, featuredIds, viewerIds, eventId, folderId, tags, gradeTag }) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token

    const urlRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ mode: 'upload', file_name: file.name }),
    })
    const urlData = await urlRes.json()
    if (urlData.error) throw new Error(urlData.error)

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', urlData.upload_url)
      xhr.upload.onprogress = e => { if (e.lengthComputable) setUpload(u => u ? { ...u, progress: Math.round((e.loaded / e.total) * 100) } : u) }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`))
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(file)
    })

    const { data: newFootage, error: insertErr } = await supabase.from('fight_footage').insert({
      title: title.trim(),
      description: description?.trim() || null,
      storage_path: urlData.storage_path,
      file_size_bytes: file.size,
      access_mode: accessMode,
      event_id: eventId || null,
      folder_id: folderId || null,
      tags: tags && tags.length > 0 ? tags : null,
      grade_tag: gradeTag || null,
      published: false, // sits in the Uploads tab's pending list first -- an explicit "Publish to View IT" action is what makes it show there
    }).select().single()
    if (insertErr) throw insertErr

    await saveFootageAthletes(newFootage.id, { accessMode, featuredIds, viewerIds })
    return newFootage
  }, [])

  const runUpload = useCallback(async ({ file, title, description, accessMode, featuredIds, viewerIds, eventId, folderId, tags, gradeTag }) => {
    setUpload({ title, current: 1, total: 1, progress: 0, status: 'uploading', error: null })
    try {
      const result = await uploadSingleFile(file, { title, description, accessMode, featuredIds, viewerIds, eventId, folderId, tags, gradeTag })
      setUpload(u => u ? { ...u, status: 'done' } : u)
      setTimeout(() => setUpload(u => (u?.status === 'done' ? null : u)), 5000) // auto-clears the "done" banner after a few seconds, but leaves an error banner up until dismissed
      return result
    } catch (err) {
      setUpload(u => u ? { ...u, status: 'error', error: err.message } : u)
      return null
    }
  }, [uploadSingleFile])

  // Bulk: event/folder/access/tags/grade are shared across the batch, but
  // each item carries its own title and "athletes in this fight" -- so one
  // batch can hold several athletes' fights from the same event. Uploaded
  // one at a time (sequentially) so a big backlog doesn't hammer the
  // connection with dozens of simultaneous large uploads.
  const runBulkUpload = useCallback(async (items, { accessMode, viewerIds, eventId, folderId, tags, gradeTag }) => {
    const total = items.length
    setUpload({ title: `${total} file${total === 1 ? '' : 's'}`, current: 0, total, progress: 0, status: 'uploading', error: null })
    let successCount = 0
    let firstError = null
    for (let i = 0; i < items.length; i++) {
      const { file, title, featuredIds } = items[i]
      setUpload(u => u ? { ...u, current: i + 1, progress: 0, title: title || file.name } : u)
      try {
        await uploadSingleFile(file, {
          title: title?.trim() || file.name.replace(/\.[^.]+$/, ''),
          description: '',
          accessMode,
          featuredIds,
          viewerIds,
          eventId,
          folderId,
          tags,
          gradeTag,
        })
        successCount++
      } catch (err) {
        // Keeps going with the rest of the batch even if one file fails.
        firstError = firstError || err.message
        console.error(`Failed to upload ${file.name}:`, err.message)
      }
    }
    const allSucceeded = successCount === total
    setUpload(u => u ? {
      ...u,
      status: allSucceeded ? 'done' : 'error',
      error: allSucceeded ? null : `${total - successCount} of ${total} file(s) failed (${firstError})`,
    } : u)
    if (allSucceeded) setTimeout(() => setUpload(u => (u?.status === 'done' ? null : u)), 5000)
  }, [uploadSingleFile])

  // Queue: a new upload started while another is running waits its turn
  // instead of running alongside it (which would fight over the one
  // progress banner and the connection). Lets the form clear straight
  // away so the next batch can be set up and queued immediately.
  const chainRef = useRef(Promise.resolve())
  const [queued, setQueued] = useState(0)
  const enqueue = useCallback((job) => {
    setQueued(q => q + 1)
    const p = chainRef.current.then(() => { setQueued(q => q - 1); return job() }).catch(err => { console.error('Upload job failed:', err) })
    chainRef.current = p
    return p
  }, [])
  const startUpload = useCallback((args) => enqueue(() => runUpload(args)), [enqueue, runUpload])
  const startBulkUpload = useCallback((items, opts) => enqueue(() => runBulkUpload(items, opts)), [enqueue, runBulkUpload])

  function dismissUpload() {
    setUpload(null)
  }

  return (
    <FightFootageUploadContext.Provider value={{ upload, queued, startUpload, startBulkUpload, dismissUpload }}>
      {children}
    </FightFootageUploadContext.Provider>
  )
}

export function useFightFootageUpload() {
  return useContext(FightFootageUploadContext)
}
