import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CctvViewer from './CctvViewer.jsx'
import ViewIt from './ViewIt.jsx'

// Shared entry point for CCTV and View IT -- deliberately just a thin
// tab wrapper around the two existing, fully separate pages rather
// than merging their underlying data/access-control systems. CCTV
// stays staff-only security footage, View IT keeps its own
// coach/athlete sharing rules -- combining those into one system would
// risk exactly the kind of access-control bug already found and fixed
// once (a dual-role account seeing footage it shouldn't). This page
// just gives one shared "all video lives here" front door.
export default function Media() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('cctv')

  return (
    <div>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate(-1)}>← Back</button>

      <div className="page-header">
        <h1>Media</h1>
        <p>CCTV footage and coach-shared fight/sparring video, all in one place</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={tab === 'cctv' ? 'btn btn-primary' : 'btn'} onClick={() => setTab('cctv')}>📹 CCTV</button>
        <button className={tab === 'view-it' ? 'btn btn-primary' : 'btn'} onClick={() => setTab('view-it')}>🥊 View IT</button>
      </div>

      {/* embedded hides each page's own back-button/header, since this
          wrapper already provides those. */}
      {tab === 'cctv' ? <CctvViewer embedded /> : <ViewIt embedded />}
    </div>
  )
}
