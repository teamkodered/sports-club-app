import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('members')
      .select('*, houses(id, name, colour)')
      .eq('auth_id', userId)
      .single()
    if (data) {
      // Also fetch student record to check if KR/KRBA athlete
      const { data: studentData } = await supabase
        .from('students')
        .select('id, discipline, is_kr, is_pts, is_leader, student_ref, pka_belt, krba_level')
        .eq('member_id', data.id)
        .single()
      setProfile({ ...data, student: studentData || null })
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

  const isAdmin   = profile?.role === 'admin' || profile?.role === 'captain'
  const isAthlete = !!(profile?.student?.is_kr || profile?.student?.discipline === 'KRBA' || profile?.student?.is_pts)

  return (
    <AuthContext.Provider value={{ session, profile, isAdmin, isAthlete, loading, refreshProfile: () => fetchProfile(session?.user?.id) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
