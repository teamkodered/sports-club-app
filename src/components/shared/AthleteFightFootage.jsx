import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import FightFootagePlayer from './FightFootagePlayer.jsx'

// Shows an athlete the fight footage a coach has shared with them
// (tagged specifically, or sent to the whole team) -- RLS on
// fight_footage already scopes this correctly, so this just displays
// whatever comes back. Renders nothing at all if there's none, so it
// never adds clutter for an athlete with nothing shared yet.
export default function AthleteFightFootage({ studentId }) {
  const [footage, setFootage] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [playingUrl, setPlayingUrl] = useState(null)
  const [playingTitle, setPlayingTitle] = useState('')

  useEffect(() => {
    if (!studentId) return
    supabase.from('fight_footage').select('*').order('uploaded_at', { ascending: false }).then(({ data }) => {
      setFootage(data || [])
      setLoaded(true)
    })
  }, [studentId])

  async function open(item) {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ mode: 'read', footage_id: item.id }),
    })
    const data = await res.json()
    if (data.error) { alert("Couldn't open this video: " + data.error); return }
    setPlayingUrl(data.url)
    setPlayingTitle(item.title)
  }

  if (!loaded || footage.length === 0) return null

  return (
    <div className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>🥊 Fight footage from your coach</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {footage.map(item => (
          <div key={item.id} onClick={() => open(item)} style={{ cursor: 'pointer', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>▶️ {item.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {new Date(item.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </div>
            {item.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{item.description}</div>}
          </div>
        ))}
      </div>

      {playingUrl && (
        <FightFootagePlayer videoUrl={playingUrl} title={playingTitle} onClose={() => { setPlayingUrl(null); setPlayingTitle('') }} />
      )}
    </div>
  )
}
