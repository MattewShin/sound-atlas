import { useEffect, useState } from 'react'
import { getSocialClient } from '../data/socialClient.js'

export default function useSocialSession(client = getSocialClient()) {
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!client) return
    const { data: { subscription } } = client.db.auth.onAuthStateChange((_event, value) => setSession(value))
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('atlas-auth-reset') : null
    if (channel) channel.onmessage = () => { setSession(null); void client.db.auth.signOut({ scope: 'local' }).catch(() => {}) }
    return () => { subscription.unsubscribe(); channel?.close() }
  }, [client])
  return { client, session, error, login: async () => { try { setError(''); await client.login() } catch (e) { setError(e.message) } },
    logout: async () => {
      setSession(null)
      const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('atlas-auth-reset') : null
      channel?.postMessage('logout'); channel?.close()
      try {
        const { error: failure } = await client.logout()
        if (failure) setError('기기에서 로그아웃했어요. 서버 로그아웃 요청은 실패했어요.')
      } catch { setError('기기에서 로그아웃했어요. 서버 로그아웃 요청은 실패했어요.') }
    } }
}
