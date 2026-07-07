import { useState, type FormEvent } from 'react'
import { Loader2, Lock, Mail, Scale, UserPlus } from 'lucide-react'
import { useAuth, type AuthView } from '../../store/AuthContext'

function AuthTabs({ view, onChange }: { view: AuthView; onChange: (v: AuthView) => void }) {
  const tabs: { id: AuthView; label: string }[] = [
    { id: 'login', label: '登录' },
    { id: 'register', label: '注册' },
    { id: 'forgot', label: '找回密码' },
  ]
  if (view === 'reset') return null

  return (
    <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            view === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth()

  if (!auth.configured) return children
  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    )
  }
  if (auth.session && auth.authView !== 'reset') return children

  return <AuthScreen />
}

function AuthScreen() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    auth.clearAuthFeedback()
    try {
      if (auth.authView === 'login') {
        await auth.signIn(email, password)
      } else if (auth.authView === 'register') {
        if (password.length < 6) {
          throw new Error('密码至少 6 位')
        }
        if (password !== confirmPassword) {
          throw new Error('两次输入的密码不一致')
        }
        await auth.signUp(email, password)
      } else if (auth.authView === 'forgot') {
        await auth.resetPassword(email)
      } else if (auth.authView === 'reset') {
        if (password.length < 6) {
          throw new Error('密码至少 6 位')
        }
        if (password !== confirmPassword) {
          throw new Error('两次输入的密码不一致')
        }
        await auth.updatePassword(password)
      }
    } catch (err) {
      if (err instanceof Error && !auth.authError) {
        // signIn/signUp 已设置 authError
      }
    } finally {
      setSubmitting(false)
    }
  }

  const title =
    auth.authView === 'register'
      ? '创建账号'
      : auth.authView === 'forgot'
        ? '找回密码'
        : auth.authView === 'reset'
          ? '设置新密码'
          : '登录 Flow Analysis'

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <Scale className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">登录后项目与报告将同步到云端</p>
        </div>

        <AuthTabs view={auth.authView} onChange={auth.setAuthView} />

        <form onSubmit={handleSubmit} className="space-y-4">
          {auth.authView !== 'reset' && (
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-sm text-slate-700">
                <Mail size={14} /> 邮箱
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="you@example.com"
              />
            </label>
          )}

          {auth.authView !== 'forgot' && (
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-sm text-slate-700">
                <Lock size={14} /> {auth.authView === 'reset' ? '新密码' : '密码'}
              </span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="至少 6 位"
              />
            </label>
          )}

          {(auth.authView === 'register' || auth.authView === 'reset') && (
            <label className="block">
              <span className="mb-1 text-sm text-slate-700">确认密码</span>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          )}

          {auth.authError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{auth.authError}</p>
          )}
          {auth.authMessage && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{auth.authMessage}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {auth.authView === 'login' && '登录'}
            {auth.authView === 'register' && (
              <>
                <UserPlus size={16} /> 注册
              </>
            )}
            {auth.authView === 'forgot' && '发送重置邮件'}
            {auth.authView === 'reset' && '保存新密码'}
          </button>
        </form>
      </div>
    </div>
  )
}

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    setSubmitting(true)
    try {
      await auth.updatePassword(password)
      onClose()
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">修改密码</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="新密码"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="确认新密码"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
