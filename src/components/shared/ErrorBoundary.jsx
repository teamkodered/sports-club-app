import { Component } from 'react'

// Catches any uncaught error anywhere in the render tree. Without
// this, React's default behavior on an uncaught render error is to
// silently unmount the entire app -- producing exactly a blank white
// screen with zero indication of what went wrong, which is very hard
// to diagnose remotely. This shows the actual error message instead.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Uncaught render error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', background: '#111', color: '#fff' }}>
          <div style={{ maxWidth: 480 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ color: '#9AA5B1', marginBottom: 16 }}>
              The app hit an unexpected error trying to load this page. Please screenshot this and send it to your coach/admin.
            </p>
            <pre style={{ textAlign: 'left', background: '#1a1a1a', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto', color: '#e24b4a', marginBottom: 16 }}>
              {this.state.error.message}
            </pre>
            <button
              style={{ padding: '10px 20px', background: '#378ADD', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
              onClick={() => { this.setState({ error: null }); window.location.href = '/login' }}>
              Sign out and try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
