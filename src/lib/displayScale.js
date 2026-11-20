import { useEffect, useState } from 'react'

// On a PC / big screen, lists (registers, students) and the side menu are drawn bigger: what used to be
// 150% is now "100%". Phones are unchanged. Zoom buttons still work on top of this.
const DESKTOP = '(min-width: 1024px)'
export function useDisplayScale() {
  const [big, setBig] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP).matches)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP), on = () => setBig(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return { table: big ? 1.5 : 1, menu: big ? 1.25 : 1 }
}
