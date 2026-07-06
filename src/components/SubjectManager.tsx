import { useState } from 'react'
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useApp } from '../store/AppContext'

export function SubjectManager() {
  const { state, dispatch } = useApp()
  const [name, setName] = useState('')
  const [accounts, setAccounts] = useState('')

  const add = () => {
    if (!name.trim()) return
    dispatch({
      type: 'ADD_SUBJECT',
      subject: {
        id: uuidv4(),
        name: name.trim(),
        accounts: accounts.split(/[,，\s]+/).filter(Boolean),
        isTracked: true,
      },
    })
    setName('')
    setAccounts('')
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">核查对象管理</h3>

      <div className="mb-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="对象名称"
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          value={accounts}
          onChange={(e) => setAccounts(e.target.value)}
          placeholder="关联账号（逗号分隔）"
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={add}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          <Plus size={14} /> 添加
        </button>
      </div>

      {state.subjects.length === 0 ? (
        <p className="text-xs text-slate-400">添加需要追踪的核查对象，系统将聚焦分析与其相关的资金往来</p>
      ) : (
        <ul className="space-y-2">
          {state.subjects.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <div>
                <span className="font-medium text-slate-800">{s.name}</span>
                {s.accounts.length > 0 && (
                  <span className="ml-2 text-xs text-slate-500">{s.accounts.join(', ')}</span>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => dispatch({ type: 'UPDATE_SUBJECT', id: s.id, updates: { isTracked: !s.isTracked } })}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  {s.isTracked ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  onClick={() => dispatch({ type: 'REMOVE_SUBJECT', id: s.id })}
                  className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
