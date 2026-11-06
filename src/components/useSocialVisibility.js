import { useEffect, useRef, useState } from 'react'
import { getSocialApi } from '../data/socialClient.js'

// Legacy story routes and the new feed share the same empty invalidation channel.
export default function useSocialVisibility(client, clear, refresh) {
  const callbacks = useRef({ clear, refresh }); callbacks.current = { clear, refresh }
  const [connected, setConnected] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!client) return
    let subscribed = false
    const invalidate = () => { callbacks.current.clear(); if (subscribed && !document.hidden) callbacks.current.refresh() }
    const stop = getSocialApi(client).subscribe(invalidate, status => {
      subscribed = status === 'SUBSCRIBED'; setConnected(subscribed)
      invalidate()
    })
    const offline = () => { subscribed = false; setConnected(false); callbacks.current.clear() }
    const online = () => setRevision(v => v + 1)
    window.addEventListener('offline', offline); window.addEventListener('focus', invalidate)
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', invalidate); window.addEventListener('pagehide', offline)
    return () => { stop(); window.removeEventListener('offline', offline); window.removeEventListener('online', online); window.removeEventListener('focus', invalidate); document.removeEventListener('visibilitychange', invalidate); window.removeEventListener('pagehide', offline) }
  }, [client, revision])
  return connected
}
