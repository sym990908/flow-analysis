import { useState } from 'react'
import { ChevronDown, KeyRound, LogOut, User } from 'lucide-react'
import { useAuth } from '../../store/AuthContext'
import { ChangePasswordModal } from './AuthGate'

export function UserMenu() {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  if (!auth.configured || !auth.user) return null

  const email = auth.user.email ?? '用户'

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <User size={16} className="text-blue-600" />
          <span className="hidden max-w-[160px] truncate sm:inline">{email}</span>
          <ChevronDown size={14} />
        </button>
        {open && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-10"
              aria-label="关闭菜单"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setChangePasswordOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <KeyRound size={14} /> 修改密码
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  void auth.signOut()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut size={14} /> 退出登录
              </button>
            </div>
          </>
        )}
      </div>
      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </>
  )
}
