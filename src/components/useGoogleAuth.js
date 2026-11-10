import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { clearAccountLocalData } from '../data/userLibrary.js'

const messageForAuthError = (error) => {
  if (!error) return null
  if (error.name === 'AbortError') return '로그인이 취소됐어요. 다시 시도해 주세요.'
  return 'Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.'
}

export default function useGoogleAuth(client = supabase) {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(Boolean(client))
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState(null)
  const revision = useRef(0), discardedUser = useRef(null)
  const [sessionVersion, setSessionVersion] = useState(0)
  const switching = useRef(false), oauthPending = useRef(false)

  useEffect(() => {
    if (!client) {
      setIsLoading(false)
      return undefined
    }

    let active = true
    const initialRevision = ++revision.current
    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || initialRevision !== revision.current) return
      setSession(data?.session ?? null)
      setError(messageForAuthError(sessionError))
      setIsLoading(false)
    })
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      revision.current++
      if (event !== 'SIGNED_IN' && nextSession?.user?.id === discardedUser.current) return
      if (event === 'SIGNED_IN') discardedUser.current = null
      setSession(nextSession)
      setError(null)
      setIsLoading(false)
    })

    return () => {
      active = false
      data?.subscription?.unsubscribe()
    }
  }, [client])

  const beginGoogle = useCallback(async (selectAccount = false) => {
    if (!client) {
      setError('로그인 설정을 확인하고 다시 배포해 주세요.')
      return
    }
    if (oauthPending.current) return
    oauthPending.current = true
    setError(null)
    setIsLoading(true)
    const redirectTo = typeof window === 'undefined' ? undefined : `${window.location.origin}/`
    try { const { error: signInError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: false, ...(selectAccount ? { queryParams: { prompt: 'select_account' } } : {}) },
    })
    if (signInError) {
      setError(messageForAuthError(signInError))
      setIsLoading(false)
    }
    } catch (failure) { setError(messageForAuthError(failure)); setIsLoading(false) }
    finally { oauthPending.current = false }
  }, [client])
  const signInWithGoogle = useCallback(() => beginGoogle(), [beginGoogle])

  const signOut = useCallback(async () => {
    if (!client) return false
    setError(null)
    setIsLoading(true)
    discardedUser.current = session?.user?.id ?? null
    revision.current++; setSession(null); setSessionVersion(v => v + 1)
    clearAccountLocalData()
    try {
      const { error: signOutError } = await client.auth.signOut({ scope: 'local' })
      if (signOutError) { setError('이 기기에서 로그아웃했어요. 서버 연결은 다시 확인해 주세요.'); return false }
      return true
    } catch { setError('이 기기에서 로그아웃했어요. 서버 연결은 다시 확인해 주세요.'); return false }
    finally { setIsLoading(false) }
  }, [client, session?.user?.id])
  const switchGoogleAccount = useCallback(async () => {
    if (switching.current) return
    switching.current = true
    try { if (await signOut()) await beginGoogle(true) }
    finally { switching.current = false }
  }, [signOut, beginGoogle])

  const deleteAccount = useCallback(async () => {
    if (!client || !session?.user) return false
    setError(null)
    setIsDeleting(true)
    const { error: deleteError } = await client.rpc('delete_current_user_account')
    if (deleteError) {
      setError('계정과 데이터를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.')
      setIsDeleting(false)
      return false
    }

    // 서버 계정이 먼저 삭제되므로 원격 로그아웃 실패와 무관하게 로컬 세션을 폐기합니다.
    discardedUser.current = session.user.id
    revision.current++; setSession(null); setSessionVersion(v => v + 1)
    clearAccountLocalData()
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    setSession(null)
    setIsDeleting(false)
    return true
  }, [client, session?.user])

  return {
    configured: Boolean(client),
    error,
    deleteAccount,
    isDeleting,
    isLoading,
    session,
    sessionVersion,
    signInWithGoogle,
    signOut,
    switchGoogleAccount,
    user: session?.user ?? null,
  }
}
