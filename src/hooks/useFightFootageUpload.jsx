import { createContext, useContext, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

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

  const uploadSingleFile = useCallback(async (file, { title, description, accessMode, studentIds, eventId }) => {
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
    }).select().single()
    if (insertErr) throw insertErr

    if (accessMode === 'select_athletes' && studentIds?.size > 0) {
      await supabase.from('fight_footage_athletes').insert(
        [...studentIds].map(student_id => ({ footage_id: newFootage.id, student_id }))
      )
    }
    return newFootage
  }, [])

  const startUpload = useCallback(async ({ file, title, description, accessMode, studentIds, eventId }) => {
    setUpload({ title, current: 1, total: 1, progress: 0, status: 'uploading', error: null })
    try {
      const result = await uploadSingleFile(file, { title, description, accessMode, studentIds, eventId })
      setUpload(u => u ? { ...u, status: 'done' } : u)
      setTimeout(() => setUpload(u => (u?.status === 'done' ? null : u)), 5000) // auto-clears the "done" banner after a few seconds, but leaves an error banner up until dismissed
      return result
    } catch (err) {
      setUpload(u => u ? { ...u, status: 'error', error: err.message } : u)
      return null
    }
  }, [uploadSingleFile])

  // Bulk: one shared accessMode/studentIds/eventId applied to every
  // file, each titled from its own filename, uploaded one at a time
  // (sequentially) rather than all at once so a big backlog doesn't
  // hammer the connection with dozens of simultaneous large uploads.
  const startBulkUpload = useCallback(async (files, { accessMode, studentIds, eventId }) => {
    const total = files.length
    setUpload({ title: `${total} file${total === 1 ? '' : 's'}`, current: 0, total, progress: 0, status: 'uploading', error: null })
    let successCount = 0
    let firstError = null
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUpload(u => u ? { ...u, current: i + 1, progress: 0, title: file.name } : u)
      try {
        await uploadSingleFile(file, {
          title: file.name.replace(/\.[^.]+$/, ''),
          description: '',
          accessMode,
          studentIds,
          eventId,
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

  function dismissUpload() {
    setUpload(null)
  }

  return (
    <FightFootageUploadContext.Provider value={{ upload, startUpload, startBulkUpload, dismissUpload }}>
      {children}
    </FightFootageUploadContext.Provider>
  )
}

export function useFightFootageUpload() {
  return useContext(FightFootageUploadContext)
}
