import { useState, useEffect, useCallback, useRef } from 'react'

// Drop-in replacement for useState, specifically for the "which tab/
// section is showing" state used throughout the app (Home, Note,
// League, etc. within a single page/URL).
//
// The problem this fixes: switching tabs via plain useState never
// touches the browser's actual history -- the URL and history stack
// stay exactly the same the whole time you're clicking through
// sections. So the phone's native back button/gesture has nothing
// real to step back through, and instead jumps straight to wherever
// the last ACTUAL navigation was (typically the app's launch page),
// which looks like "back always goes to Home" no matter how many
// sections deep you were.
//
// This pushes a real history entry every time the tab changes, and
// listens for the back button (popstate) to restore the previous tab
// instead of leaving the browser to fall through to an earlier route.
export function useBackableTab(defaultValue, key = 'tab') {
  const [value, setValue] = useState(() => window.history.state?.[key] ?? defaultValue)
  const valueRef = useRef(value)
  valueRef.current = value

  const setTab = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(valueRef.current) : next
    if (resolved === valueRef.current) return
    setValue(resolved)
    window.history.pushState({ ...window.history.state, [key]: resolved }, '')
  }, [key])

  useEffect(() => {
    function onPopState(e) {
      setValue(e.state?.[key] ?? defaultValue)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [value, setTab]
}
