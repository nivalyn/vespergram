import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext'

export function useReducedMotion(): boolean {
  const { settings } = useApp()
  const [systemReduced, setSystemReduced] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReduced(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  if (settings.motion === 'off') return true
  if (settings.motion === 'on') return false
  return systemReduced
}
