import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../lib/supabase.js'

const SIDEBAR_FULL = 220
const SIDEBAR_ICON = 52

export default function Layout() {
  const { profile, isAdmin, isAthlete } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen]   = useState(false)
  const [collapsed, setCollapsed]     = useState(false)
  const [profileMenu, setProfileMenu] = useState(false)
  const [hovered, setHovered]         = useState(false)
  const [clubName, setClubName]       = useState('KR Centre')
  const [clubEmoji, setClubEmoji]     = useState('🔥')
  const [clubTagline, setClubTagline] = useState('Sports Club Portal')
  const hoverTimer = useRef(null)

  // On desktop: expand is either full (not collapsed) or icon+hover
  // expanded = full sidebar shown
  const expanded = !collapsed || hovered

  // Swipe to open/close on mobile
  useEffect(() => {
    let startX = 0
    const threshold = 50
    function onStart(e) { startX = e.touches[0].clientX }
    function onEnd(e) {
      const diff = e.changedTouches[0].clientX - startX
      if (Math.abs(diff) < threshold) return
      if (diff > 0 && startX < 40) setMobileOpen(true)
      if (diff < 0) setMobileOpen(false)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])

  useEffect(() => {
    supabase.from('settings').select('key,value')
      .in('key', ['club_name','club_emoji','club_tagline'])
      .then(({ data }) => {
        if (!data) return
        const m = Object.fromEntries(data.map(r => [r.key, r.value]))
        if (m.club_name)    { setClubName(m.club_name); document.title = m.club_name }
        if (m.club_emoji)   setClubEmoji(m.club_emoji)
        if (m.club_tagline) setClubTagline(m.club_tagline)
      })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function handleMouseEnter() {
    clearTimeout(hoverTimer.current)
    if (collapsed) setHovered(true)
  }
  function handleMouseLeave() {
    hoverTimer.current = setTimeout(() => setHovered(false), 200)
  }

  const initials = profile
    ? `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()
    : '?'

  const close = () => setMobileOpen(false)
  const sidebarW = expanded ? SIDEBAR_FULL : SIDEBAR_ICON

  const NAV_ITEMS = [
    { section: 'Main' },
    { to: '/dashboard',      icon: '🏠', label: 'Dashboard' },
    { to: '/athlete-app', icon: '🎽', label: 'My app' },
    { to: '/registers',      icon: '📋', label: 'Registers' },
    { to: '/checkin',         icon: '✅', label: 'Check in' },
    { to: '/students',       icon: '🎽', label: 'Students' },
    { to: '/members',        icon: '👥', label: 'Members' },
    { to: '/houses',         icon: '🛡️', label: 'Houses' },
    { to: '/fixtures',       icon: '📅', label: 'Fixtures' },
    { to: '/classes',        icon: '🗓️', label: 'Classes' },
    { to: '/league',         icon: '🏆', label: 'League' },
    { to: '/trackers',       icon: '📈', label: 'Trackers' },
    { section: 'Forms' },
    { to: '/forms',          icon: '📝', label: 'All forms' },
    { to: '/join-pka-child', icon: '🥋', label: 'PKA Child' },
    { to: '/join-pka-adult', icon: '🥋', label: 'PKA Adult' },
    { to: '/join-krba',      icon: '🥊', label: 'KRBA' },
    { to: '/grading',        icon: '🎽', label: 'Grading' },
    { section: 'Analysis' },
    { to: '/boxing-tpt',     icon: '📊', label: 'Boxing TPT' },
    { to: '/kickboxing-tpt', icon: '📊', label: 'Kickboxing TPT' },
    { to: '/fit2fight',      icon: '💪', label: 'Fit II Fight' },
    { to: '/athletes',       icon: '🏅', label: 'Athlete profiles' },
    ...(isAdmin ? [
      { section: 'Admin' },
      { to: '/settings', icon: '⚙️', label: 'Settings' },
      { to: '/import',   icon: '⬆️', label: 'Import data' },
    ] : []),
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-tertiary)' }}>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 29 }} />
      )}

      {/* Sidebar */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`app-sidebar${mobileOpen ? ' sidebar-open' : ''}`}
        style={{
          width: sidebarW,
          minWidth: sidebarW,
          background: 'var(--bg)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'fixed',
          top: 0, left: 0,
          height: '100vh',
          zIndex: 30,
          overflowX: 'hidden',
          overflowY: 'auto',
          transition: 'width 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: expanded ? '12px 16px' : '12px 8px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'space-between' : 'center',
          minHeight: 64,
        }}>
          {expanded ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <img src="/kr-logo.png" alt="KR" style={{ height: 32, width: 32, objectFit: 'contain', flexShrink: 0, filter: 'var(--logo-filter)' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clubName}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{clubTagline}</div>
              </div>
            </div>
          ) : (
            <img src="/kr-logo.png" alt="KR" style={{ height: 30, width: 30, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
          )}

          {/* Collapse / expand button — only on desktop */}
          {expanded && (
            <button
              onClick={() => { setCollapsed(v => !v); setHovered(false) }}
              title="Collapse sidebar"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-tertiary)', fontSize: 16, padding: '2px 4px',
                flexShrink: 0, lineHeight: 1,
              }}
              className="desktop-only"
            >✕</button>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: expanded ? 8 : '8px 4px', overflowY: 'auto' }}>
          {NAV_ITEMS.map((item, i) => {
            if (item.section) {
              if (!expanded) return null
              return (
                <div key={i} style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)',
                  padding: '10px 10px 4px', letterSpacing: '0.06em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>{item.section}</div>
              )
            }
            return (
              <NavLink key={item.to} to={item.to} onClick={close}
                title={!expanded ? item.label : undefined}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: expanded ? 8 : 0,
                  justifyContent: expanded ? 'flex-start' : 'center',
                  padding: expanded ? '7px 10px' : '9px 0',
                  borderRadius: 'var(--radius)',
                  fontSize: 13,
                  color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--bg-secondary)' : 'transparent',
                  fontWeight: isActive ? 500 : 400,
                  marginBottom: 2,
                  textDecoration: 'none',
                  transition: 'all 0.1s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                })}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                {expanded && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>

        {/* Profile footer */}
        <div style={{
          padding: expanded ? 12 : '12px 4px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
          position: 'relative',
        }}>
          <button onClick={() => setProfileMenu(v => !v)} style={{
            display: 'flex', alignItems: 'center',
            gap: expanded ? 8 : 0,
            justifyContent: expanded ? 'flex-start' : 'center',
            width: '100%', background: 'none', border: 'none',
            cursor: 'pointer', padding: 0, textAlign: 'left',
          }}>
            <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, flexShrink: 0 }}>{initials}</div>
            {expanded && (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                    {profile ? `${profile.first_name} ${profile.last_name}` : '…'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{profile?.role || 'member'}</div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>▲</span>
              </>
            )}
          </button>

          {profileMenu && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: expanded ? 8 : 4,
              right: expanded ? 8 : 4,
              marginBottom: 4,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
              zIndex: 40,
              overflow: 'hidden',
              minWidth: 160,
            }}>
              {[
                { to: '/profile',      icon: '👤', label: 'My profile' },
                { to: '/my-dashboard', icon: '🎽', label: 'My dashboard' },
                ...(isAdmin ? [{ to: '/settings', icon: '⚙️', label: 'Settings' }] : []),
              ].map(item => (
                <NavLink key={item.to} to={item.to} onClick={() => { setProfileMenu(false); close() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', fontSize: 13,
                    color: 'var(--text)', textDecoration: 'none',
                    borderBottom: '1px solid var(--border)',
                  }}>
                  {item.icon} {item.label}
                </NavLink>
              ))}
              <button onClick={() => { setProfileMenu(false); handleLogout() }} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', fontSize: 13, color: '#e24b4a',
                background: 'none', border: 'none', cursor: 'pointer',
                width: '100%', textAlign: 'left', fontFamily: 'var(--font-sans)',
              }}>↩ Sign out</button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="app-main" style={{
        flex: 1,
        padding: '24px 28px',
        overflowY: 'auto',
        minWidth: 0,
        marginLeft: sidebarW,
        transition: 'margin-left 0.2s ease',
      }}>
        <Outlet />
      </main>

      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(v => !v)} className="app-menu-btn" style={{
        position: 'fixed', top: 12, left: 12,
        background: 'var(--text)', color: 'var(--bg)',
        border: 'none', borderRadius: 8,
        width: 40, height: 40, fontSize: 18,
        zIndex: 28, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>☰</button>

    </div>
  )
}
