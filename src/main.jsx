import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { supabase } from './lib/supabase.js'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'
import './styles/global.css'

import Login from './pages/Login.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Join from './pages/Join.jsx'
import CoachSignup from './pages/CoachSignup.jsx'
import Claim from './pages/Claim.jsx'
import JoinPKAChild from './pages/forms/JoinPKAChild.jsx'
import JoinPKAAdult from './pages/forms/JoinPKAAdult.jsx'
import JoinKRBA from './pages/forms/JoinKRBA.jsx'
import GradingExpression from './pages/forms/GradingExpression.jsx'
import BoxingTPT from './pages/forms/BoxingTPT.jsx'
import KickboxingTPT from './pages/forms/KickboxingTPT.jsx'
import FitToFight from './pages/forms/FitToFight.jsx'
import AthleteProfiles from './pages/AthleteProfiles.jsx'
import AthleteDashboard from './pages/AthleteDashboard.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Members from './pages/Members.jsx'
import Fixtures from './pages/Fixtures.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import CRM from './pages/CRM.jsx'
import LeagueViews from './pages/LeagueViews.jsx'
import LeaguePublic from './pages/LeaguePublic.jsx'
import PrivacyPolicy from './pages/PrivacyPolicy.jsx'
import ResultsPublic from './pages/ResultsPublic.jsx'
import Profile from './pages/Profile.jsx'
import AdminImport from './pages/AdminImport.jsx'
import StudentDatabase from './pages/StudentDatabase.jsx'
import Settings from './pages/Settings.jsx'
import Registers from './pages/Registers.jsx'
import Classes from './pages/Classes.jsx'
import Forms from './pages/Forms.jsx'
import Trackers from './pages/Trackers.jsx'
import CheckIn from './pages/CheckIn.jsx'
import Fit2FightForm from './pages/Fit2FightForm.jsx'
import BoxingTPTForm from './pages/BoxingTPTForm.jsx'
import AthleteApp from './pages/AthleteApp.jsx'
import CheckInPublic from './pages/CheckInPublic.jsx'
import CourseInterest from './pages/forms/CourseInterest.jsx'
import WhoopDisplayBoard from './pages/WhoopDisplayBoard.jsx'
import Layout from './components/shared/Layout.jsx'

function ProtectedRoute({ children, adminOnly = false, staffOnly = false, excludeLeader = false }) {
  const { session, profile, profileError, isAdmin, isStaff, isLeader, loading } = useAuth()
  if (loading) return <div className="loading">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <h2 style={{ marginBottom: 8 }}>We couldn't find your profile</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 420 }}>
          You're signed in, but no member record is linked to this account yet.
          {profileError === 'no_member_record' ? ' This can happen if your account was created before your membership record, or the two haven\'t been linked up.' : ` (${profileError || 'unknown error'})`}
          {' '}Please contact your coach or club admin so they can link your account.
        </p>
        <button className="btn btn-primary" onClick={() => { supabase.auth.signOut(); window.location.href = '/login' }}>Sign out</button>
      </div>
    </div>
  )
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />
  if (staffOnly && !isStaff) return <Navigate to="/athlete-app" replace />
  // Leaders count as "staff" for most areas (registers, attendance,
  // points etc), but not for CRM/Email -- this is member payment,
  // contact, and mailbox access, which stays admin/coach only. The
  // sidebar already hides the CRM link from leaders (see Layout.jsx's
  // roles list), but that alone doesn't stop direct URL access -- this
  // closes that gap.
  if (excludeLeader && isLeader) return <Navigate to="/dashboard" replace />
  return children
}

function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"           element={<Login />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/join"            element={<Join />} />
          <Route path="/coach-signup"    element={<CoachSignup />} />
          <Route path="/claim"           element={<Claim />} />
          <Route path="/join-pka-child"  element={<JoinPKAChild />} />
          <Route path="/join-pka-adult"  element={<JoinPKAAdult />} />
          <Route path="/join-krba"       element={<JoinKRBA />} />
          <Route path="/grading"         element={<GradingExpression />} />
          <Route path="/league-public"   element={<LeaguePublic />} />
          <Route path="/privacy"         element={<PrivacyPolicy />} />
          <Route path="/results-public"  element={<ResultsPublic />} />
          <Route path="/checkin-public"  element={<CheckInPublic />} />
          <Route path="/course-interest" element={<CourseInterest />} />
          <Route path="/whoop-board"     element={<WhoopDisplayBoard />} />
          <Route path="/athlete-app"     element={<ProtectedRoute><AthleteApp /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="dashboard"       element={<ProtectedRoute staffOnly><Dashboard /></ProtectedRoute>} />
            <Route path="my-dashboard"    element={<AthleteDashboard />} />
            <Route path="checkin"         element={<ProtectedRoute staffOnly><CheckIn /></ProtectedRoute>} />
            <Route path="registers"       element={<ProtectedRoute staffOnly><Registers /></ProtectedRoute>} />
            <Route path="students"        element={<ProtectedRoute staffOnly><StudentDatabase /></ProtectedRoute>} />
            <Route path="members"         element={<ProtectedRoute staffOnly><Members /></ProtectedRoute>} />
            <Route path="fixtures"        element={<Fixtures />} />
            <Route path="calendar"        element={<ProtectedRoute staffOnly><CalendarPage /></ProtectedRoute>} />
            <Route path="crm"             element={<ProtectedRoute staffOnly excludeLeader><CRM /></ProtectedRoute>} />
            <Route path="classes"         element={<ProtectedRoute staffOnly><Classes /></ProtectedRoute>} />
            <Route path="league"          element={<LeagueViews />} />
            <Route path="forms"           element={<Forms />} />
            <Route path="trackers"        element={<ProtectedRoute staffOnly><Trackers /></ProtectedRoute>} />
            <Route path="profile"         element={<Profile />} />
            <Route path="boxing-tpt"      element={<ProtectedRoute><BoxingTPT /></ProtectedRoute>} />
            <Route path="kickboxing-tpt"  element={<ProtectedRoute><KickboxingTPT /></ProtectedRoute>} />
            <Route path="fit2fight"       element={<FitToFight />} />
            <Route path="athletes"        element={<ProtectedRoute staffOnly><AthleteProfiles /></ProtectedRoute>} />
            <Route path="import"          element={<ProtectedRoute adminOnly><AdminImport /></ProtectedRoute>} />
            <Route path="settings"        element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Register a minimal, pass-through service worker -- this exists purely
// to satisfy Chrome/Android's PWA installability requirement (needed for
// the "Add to Home Screen"/install prompt to appear at all). It adds no
// caching or offline behavior, so app updates stay instant with no risk
// of a stale version getting stuck on someone's device.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal if this fails (e.g. unsupported browser) -- the app
      // still works fully in a normal browser tab either way.
    })
  })
}
