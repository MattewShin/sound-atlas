import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

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

  useEffect(() => {
    if (!client) {
      setIsLoading(false)
      return undefined
    }

    let active = true
    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      setSession(data?.session ?? null)
      setError(messageForAuthError(sessionError))
      setIsLoading(false)
    })
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setError(null)
      setIsLoading(false)
    })

    return () => {
      active = false
      data?.subscription?.unsubscribe()
    }
  }, [client])

  const signInWithGoogle = useCallback(async () => {
    if (!client) {
      setError('로그인 설정을 확인하고 다시 배포해 주세요.')
      return
    }
    setError(null)
    setIsLoading(true)
    const redirectTo = typeof window === 'undefined' ? undefined : `${window.location.origin}/`
    const { error: signInError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: false },
    })
    if (signInError) {
      setError(messageForAuthError(signInError))
      setIsLoading(false)
    }
  }, [client])

  const signOut = useCallback(async () => {
    if (!client) return
    setError(null)
    setIsLoading(true)
    const { error: signOutError } = await client.auth.signOut()
    if (signOutError) {
      setError('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.')
      setIsLoading(false)
    }
  }, [client])

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
    signInWithGoogle,
    signOut,
    user: session?.user ?? null,
  }
}
