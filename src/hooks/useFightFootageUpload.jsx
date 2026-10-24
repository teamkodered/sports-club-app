import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
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
// --- Keeping uploads going (Oct 2026) ---
// The provider sits at the app root (main.jsx), so moving between pages never
// interrupts an upload. Leaving the app is different: phones pause or cut off web
// pages in the background, so the file transfer can stall or fail. Each file
// therefore retries on its own -- it waits until the app is back on screen and
// online, then restarts that file with a fresh upload link (up to MAX_ATTEMPTS).
// A transfer with no progress for STALL_MS while on screen is restarted too.
const MAX_ATTEMPTS = 4
const STALL_MS = 90000
const isActive = () => document.visibilityState === 'visible' && navigator.onLine !== false
function waitUntilActive() {
  if (isActive()) return Promise.resolve()
  return new Promise(res => {
    const check = () => { if (isActive()) { document.removeEventListener('visibilitychange', check); window.removeEventListener('online', check); res() } }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
  })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

export function FightFootageUploadProvider({ children }) {
  const [upload, setUpload] = useState(null) // { title, current, total, progress, status: 'uploading'|'processing'|'done'|'error', error }

  const uploadSingleFile = useCallback(async (file, { title, description, accessMode, featuredIds, viewerIds, eventId, folderId, tags, gradeTag, kind = 'fight', thumb = null }) => {
    let urlData = null
    for (let attempt = 1; ; attempt++) {
      try {
        await waitUntilActive()
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData?.session?.access_token
        const urlRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ mode: 'upload', file_name: file.name }),
        })
        urlData = await urlRes.json()
        if (urlData.error) throw Object.assign(new Error(urlData.error), { permanent: true })
        setUpload(u => u ? { ...u, progress: 0, note: attempt > 1 ? `Retrying (attempt ${attempt} of ${MAX_ATTEMPTS})…` : null } : u)

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          let lastProgress = Date.now()
          const watchdog = setInterval(() => {
            // only judge a stall while on screen -- in the background the phone may simply have paused us
            if (isActive() && Date.now() - lastProgress > STALL_MS) { clearInterval(watchdog); xhr.abort(); reject(new Error('Upload stalled')) }
            if (!isActive()) { lastProgress = Date.now(); setUpload(u => u ? { ...u, note: '⏸ Paused while the app is in the background -- continues when you come back' } : u) }
          }, 5000)
          xhr.open('PUT', urlData.upload_url)
          xhr.upload.onprogress = e => {
            lastProgress = Date.now()
            if (e.lengthComputable) setUpload(u => u ? { ...u, progress: Math.round((e.loaded / e.total) * 100), note: u.note?.startsWith('⏸') ? null : u.note } : u)
          }
          xhr.onload = () => { clearInterval(watchdog); (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)) }
          xhr.onerror = () => { clearInterval(watchdog); reject(new Error('Upload failed')) }
          xhr.onabort = () => { clearInterval(watchdog); reject(new Error('Upload stalled')) }
          xhr.send(file)
        })
        break
      } catch (err) {
        if (err.permanent || attempt >= MAX_ATTEMPTS) throw err
        setUpload(u => u ? { ...u, note: isActive() ? `Connection dropped -- retrying…` : '⏸ Paused while the app is in the background -- continues when you come back' } : u)
        await waitUntilActive()
        await sleep(2000 * attempt)
      }
    }

    const row = {
      title: title.trim(),
      description: description?.trim() || null,
      storage_path: urlData.storage_path,
      file_size_bytes: file.size,
      access_mode: accessMode,
      event_id: eventId || null,
      folder_id: folderId || null,
      tags: tags && tags.length > 0 ? tags : null,
      grade_tag: gradeTag || null,
      // fight footage sits in the Uploads tab's pending list first -- an explicit "Publish to View IT" makes it show there.
      // Study videos (Media > 📚 Study) go straight into the Study list; who sees them is set by access_mode.
      ...(kind === 'study' ? { kind: 'study', published: true } : { published: false }),
    }
    // small preview picture (data URL, ~5 KB) grabbed on the device -- see lib/videoThumbs.js
    let { data: newFootage, error: insertErr } = await supabase.from('fight_footage').insert(thumb ? { ...row, thumb } : row).select().single()
    if (insertErr && thumb && /thumb/i.test(insertErr.message || '')) {
      // thumb column not added yet (supabase_fight_footage_thumbs.sql) -- save the video without it
      ({ data: newFootage, error: insertErr } = await supabase.from('fight_footage').insert(row).select().single())
    }
    if (insertErr) throw insertErr

    await saveFootageAthletes(newFootage.id, { accessMode, featuredIds, viewerIds })
    return newFootage
  }, [])

  const runUpload = useCallback(async ({ file, title, description, accessMode, featuredIds, viewerIds, eventId, folderId, tags, gradeTag, kind, thumb }) => {
    setUpload({ title, current: 1, total: 1, progress: 0, status: 'uploading', error: null })
    try {
      const result = await uploadSingleFile(file, { title, description, accessMode, featuredIds, viewerIds, eventId, folderId, tags, gradeTag, kind, thumb })
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
      const { file, title, featuredIds, thumb } = items[i]
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
          thumb,
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
  // jobs waiting or running -- while > 0 the screen is kept on and leaving the page asks first
  const activeJobsRef = useRef(0)
  const wakeRef = useRef(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!busy) { try { wakeRef.current?.release() } catch { /* */ } wakeRef.current = null; return }
    const lock = async () => { try { if (!wakeRef.current && document.visibilityState === 'visible') { wakeRef.current = await navigator.wakeLock?.request('screen'); wakeRef.current?.addEventListener?.('release', () => { wakeRef.current = null }) } } catch { /* not supported */ } }
    const onVis = () => { if (document.visibilityState === 'visible') lock() } // the browser drops the lock when the page is hidden
    const warn = e => { e.preventDefault(); e.returnValue = 'Videos are still uploading.' }
    lock()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('beforeunload', warn)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('beforeunload', warn) }
  }, [busy])

  const enqueue = useCallback((job) => {
    setQueued(q => q + 1)
    activeJobsRef.current += 1; setBusy(true)
    const p = chainRef.current.then(() => { setQueued(q => q - 1); return job() }).catch(err => { console.error('Upload job failed:', err) })
      .finally(() => { activeJobsRef.current -= 1; if (activeJobsRef.current <= 0) { activeJobsRef.current = 0; setBusy(false) } })
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
