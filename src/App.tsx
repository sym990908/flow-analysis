import { useMemo, useState } from 'react'
import { Scale, Home } from 'lucide-react'
import { AppProvider, useApp } from './store/AppContext'
import { AuthProvider, useAuth } from './store/AuthContext'
import { StepIndicator } from './components/StepIndicator'
import { ParseJobBanner } from './components/ParseJobBanner'
import { ReportJobBanner } from './components/ReportJobBanner'
import { ReportJobRunner } from './components/ReportJobRunner'
import { ProjectPersistence } from './components/ProjectPersistence'
import { AuthGate } from './components/auth/AuthGate'
import { UserMenu } from './components/auth/UserMenu'
import { Step1Upload } from './pages/Step1Upload'
import { Step2Structure } from './pages/Step2Structure'
import { Step3Analysis } from './pages/Step3Analysis'
import { goProjectHome, isProjectHome, navigateToStep } from './lib/navigation'
import { getStepAccess, getStepStats, stepBlockedReason } from './lib/stepNavigation'

function AppContent() {
  const { state, dispatch } = useApp()
  const { configured: supabaseConfigured } = useAuth()
  const [blockedHint, setBlockedHint] = useState<string | null>(null)
  const onHome = isProjectHome(state)
  const access = useMemo(() => getStepAccess(state), [state])
  const stats = useMemo(() => getStepStats(state), [state])

  const handleStepClick = (step: 1 | 2 | 3) => {
    const reason = stepBlockedReason(state, step)
    if (reason) {
      setBlockedHint(reason)
      window.setTimeout(() => setBlockedHint(null), 3000)
      return
    }
    setBlockedHint(null)
    navigateToStep(dispatch, step)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <ProjectPersistence />
      <ReportJobRunner />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <Scale className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Flow Analysis</h1>
              <p className="text-xs text-slate-500">
                {supabaseConfigured ? '登录后项目与报告同步云端' : '进度与报告自动保存到本地'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              value={state.projectName}
              onChange={(e) => dispatch({ type: 'SET_PROJECT_NAME', name: e.target.value })}
              className="hidden rounded border border-slate-200 px-3 py-1 text-sm sm:block"
            />
            <UserMenu />
            {!onHome && (
              <button
                type="button"
                onClick={() => goProjectHome(dispatch)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Home size={16} /> 项目首页
              </button>
            )}
          </div>
        </div>
        <StepIndicator
          current={state.currentStep}
          access={access}
          stats={stats}
          onStepClick={handleStepClick}
          blockedHint={blockedHint}
        />
      </header>

      <ParseJobBanner />
      <ReportJobBanner />

      <main className="mx-auto max-w-6xl px-4 py-8">
        {state.currentStep === 1 && <Step1Upload />}
        {state.currentStep === 2 && <Step2Structure />}
        {state.currentStep === 3 && <Step3Analysis />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </AuthGate>
    </AuthProvider>
  )
}
