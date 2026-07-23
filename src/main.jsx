import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
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
import LeagueViews from './pages/LeagueViews.jsx'
import LeaguePublic from './pages/LeaguePublic.jsx'
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
import Layout from './components/shared/Layout.jsx'

function ProtectedRoute({ children, adminOnly = false, staffOnly = false }) {
  const { session, isAdmin, isStaff, loading } = useAuth()
  if (loading) return <div className="loading">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />
  if (staffOnly && !isStaff) return <Navigate to="/athlete-app" replace />
  return children
}

function App() {
  return (
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
          <Route path="/checkin-public"  element={<CheckInPublic />} />
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
            <Route path="classes"         element={<ProtectedRoute staffOnly><Classes /></ProtectedRoute>} />
            <Route path="league"          element={<LeagueViews />} />
            <Route path="forms"           element={<Forms />} />
            <Route path="trackers"        element={<ProtectedRoute staffOnly><Trackers /></ProtectedRoute>} />
            <Route path="profile"         element={<Profile />} />
            <Route path="boxing-tpt"      element={<ProtectedRoute staffOnly><BoxingTPT /></ProtectedRoute>} />
            <Route path="kickboxing-tpt"  element={<ProtectedRoute staffOnly><KickboxingTPT /></ProtectedRoute>} />
            <Route path="fit2fight"       element={<FitToFight />} />
            <Route path="athletes"        element={<ProtectedRoute staffOnly><AthleteProfiles /></ProtectedRoute>} />
            <Route path="import"          element={<ProtectedRoute adminOnly><AdminImport /></ProtectedRoute>} />
            <Route path="settings"        element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
