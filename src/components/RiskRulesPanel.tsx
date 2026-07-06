import { useApp } from '../store/AppContext'
import type { RiskRule } from '../types'

export function RiskRulesPanel() {
  const { state, dispatch } = useApp()

  const toggle = (id: string) => {
    const rules = state.riskRules.map((r: RiskRule) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r,
    )
    dispatch({ type: 'SET_RISK_RULES', rules })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">风险检测规则</h3>
      <div className="space-y-2">
        {state.riskRules.map((rule) => (
          <label key={rule.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={() => toggle(rule.id)}
              className="mt-0.5 rounded"
            />
            <div>
              <span className="text-sm font-medium text-slate-800">{rule.name}</span>
              <p className="text-xs text-slate-500">{rule.description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
