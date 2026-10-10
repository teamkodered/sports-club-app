import { useEffect } from 'react'

// Polar redirects the athlete here (the redirect URL registered with Polar).
// Forward the query (code + state) to the polar-oauth-callback function, which
// finishes connecting and sends the athlete back to the app.
export default function PolarCallback() {
  useEffect(() => {
    window.location.replace(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polar-oauth-callback${window.location.search}`)
  }, [])
  return <div style={{ padding: 40, textAlign: 'center', color: '#ccc', fontFamily: 'sans-serif' }}>Connecting Polar…</div>
}
