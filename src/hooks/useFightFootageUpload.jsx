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
  const [upload, setUpload] = useState(null) // { title, progress, status: 'uploading'|'processing'|'done'|'error', error }

  const startUpload = useCallback(async ({ file, title, description, accessMode, studentIds }) => {
    setUpload({ title, progress: 0, status: 'uploading', error: null })
    try {
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

      setUpload(u => u ? { ...u, status: 'processing', progress: 100 } : u)

      const { data: newFootage, error: insertErr } = await supabase.from('fight_footage').insert({
        title: title.trim(),
        description: description.trim() || null,
        storage_path: urlData.storage_path,
        file_size_bytes: file.size,
        access_mode: accessMode,
      }).select().single()
      if (insertErr) throw insertErr

      if (accessMode === 'select_athletes' && studentIds.size > 0) {
        await supabase.from('fight_footage_athletes').insert(
          [...studentIds].map(student_id => ({ footage_id: newFootage.id, student_id }))
        )
      }

      setUpload(u => u ? { ...u, status: 'done' } : u)
      setTimeout(() => setUpload(u => (u?.status === 'done' ? null : u)), 5000) // auto-clears the "done" banner after a few seconds, but leaves an error banner up until dismissed
      return newFootage
    } catch (err) {
      setUpload(u => u ? { ...u, status: 'error', error: err.message } : u)
      return null
    }
  }, [])

  function dismissUpload() {
    setUpload(null)
  }

  return (
    <FightFootageUploadContext.Provider value={{ upload, startUpload, dismissUpload }}>
      {children}
    </FightFootageUploadContext.Provider>
  )
}

export function useFightFootageUpload() {
  return useContext(FightFootageUploadContext)
}
