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

  const [profileError, setProfileError] = useState(null)

  async function fetchProfile(userId) {
    setProfileError(null)
    const { data, error } = await supabase
      .from('members')
      .select('*, houses(id, name, colour)')
      .eq('auth_id', userId)
      .maybeSingle()
    if (error) {
      console.error('Error fetching member profile:', error)
      setProfileError(error.message)
      setProfile(null)
      setLoading(false)
      return
    }
    if (!data) {
      console.error('No members row found for auth_id', userId)
      setProfileError('no_member_record')
      setProfile(null)
      setLoading(false)
      return
    }
    // Also fetch student record to check if KR/KRBA athlete
    const { data: studentRows } = await supabase
      .from('students')
      .select('id, discipline, is_kr, is_pts, is_leader, student_ref, pka_belt, krba_level')
      .eq('member_id', data.id)
      .limit(1)
    setProfile({ ...data, student: studentRows?.[0] || null })
    setLoading(false)
  }

  const role      = profile?.role || 'member'
  const isAdmin   = role === 'admin'
  const isCoach   = role === 'captain' || role === 'coach' // 'captain' is the actual role value assigned via Settings; 'coach' kept for safety
  const isLeader  = role === 'leader'
  const isStaff   = isAdmin || isCoach || isLeader  // can take registers + points
  const isAthlete = !!(profile?.student?.is_kr || profile?.student?.discipline === 'KRBA' || profile?.student?.is_pts)

  return (
    <AuthContext.Provider value={{ session, profile, role, isAdmin, isCoach, isLeader, isStaff, isAthlete, loading, profileError, refreshProfile: () => fetchProfile(session?.user?.id) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
