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
      if (session) fetchProfile(session.user.id, session.access_token)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id, session.access_token)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  const [profileError, setProfileError] = useState(null)

  async function fetchProfile(userId, accessToken) {
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
      // No members row is linked to this login yet. If a signup was
      // recently started here that needed email confirmation first
      // (see Claim.jsx), the ref being claimed is remembered in
      // localStorage -- so this can complete that link automatically
      // now that a real session exists, rather than leaving the person
      // stuck on "no profile found" because they signed in through the
      // normal login page instead of the confirmation email's link
      // (which is the only place that retry used to happen).
      let pendingRef = null
      try { pendingRef = window.localStorage.getItem('pending_claim_ref') } catch {}
      if (pendingRef && accessToken) {
        try {
          const { data: studentRows } = await supabase
            .from('students').select('id').eq('student_ref', pendingRef).limit(1)
          const pendingStudentId = studentRows?.[0]?.id
          if (pendingStudentId) {
            const res = await fetch('/.netlify/functions/link-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({ studentId: pendingStudentId }),
            })
            const linkResult = await res.json()
            if (linkResult.success) {
              try { window.localStorage.removeItem('pending_claim_ref') } catch {}
              return fetchProfile(userId, accessToken) // re-fetch now that the link exists
            }
          }
        } catch (e) {
          console.error('Auto-completing pending profile link failed:', e)
        }
      }
      console.error('No members row found for auth_id', userId)
      // Last resort before giving up: this may be an existing member
      // signing in for the first time via a NEW login method (e.g.
      // just-added Google sign-in creates a brand new auth identity,
      // not a reuse of whatever login they had before) -- try to
      // auto-link by matching email against an existing members row,
      // the same way the pending-claim-ref path above does for a
      // different scenario.
      if (accessToken) {
        try {
          const res = await fetch('/.netlify/functions/link-by-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          })
          const linkResult = await res.json()
          if (linkResult.success) return fetchProfile(userId, accessToken) // re-fetch now that the link exists
          if (linkResult.error && linkResult.error !== 'not_found') {
            setProfileError(linkResult.message || linkResult.error)
            setProfile(null)
            setLoading(false)
            return
          }
        } catch (e) {
          console.error('Auto-link by email failed:', e)
        }
      }
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
    <AuthContext.Provider value={{ session, profile, role, isAdmin, isCoach, isLeader, isStaff, isAthlete, loading, profileError, refreshProfile: () => fetchProfile(session?.user?.id, session?.access_token) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
