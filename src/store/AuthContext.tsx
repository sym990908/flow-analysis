import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

export type AuthView = 'login' | 'register' | 'forgot' | 'reset'

interface AuthContextValue {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  authView: AuthView
  authError: string | null
  authMessage: string | null
  setAuthView: (view: AuthView) => void
  clearAuthFeedback: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [session, setSession] = useState<Session | null>(null)
  const [authView, setAuthView] = useState<AuthView>('login')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('reset')
        setAuthMessage('请设置新密码')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const clearAuthFeedback = useCallback(() => {
    setAuthError(null)
    setAuthMessage(null)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase 未配置')
    clearAuthFeedback()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message)
      throw error
    }
    setAuthMessage('登录成功')
  }, [clearAuthFeedback])

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase 未配置')
    clearAuthFeedback()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setAuthError(error.message)
      throw error
    }
    setAuthMessage('注册成功。若启用了邮箱验证，请查收邮件后再登录。')
    setAuthView('login')
  }, [clearAuthFeedback])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    clearAuthFeedback()
    await supabase.auth.signOut()
    setAuthView('login')
  }, [clearAuthFeedback])

  const resetPassword = useCallback(async (email: string) => {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase 未配置')
    clearAuthFeedback()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) {
      setAuthError(error.message)
      throw error
    }
    setAuthMessage('密码重置邮件已发送，请查收并按链接设置新密码。')
    setAuthView('login')
  }, [clearAuthFeedback])

  const updatePassword = useCallback(async (password: string) => {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase 未配置')
    clearAuthFeedback()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setAuthError(error.message)
      throw error
    }
    setAuthMessage('密码已更新')
    setAuthView('login')
  }, [clearAuthFeedback])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      authView,
      authError,
      authMessage,
      setAuthView,
      clearAuthFeedback,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [
      loading,
      session,
      authView,
      authError,
      authMessage,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      clearAuthFeedback,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
