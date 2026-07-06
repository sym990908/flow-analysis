import { useCallback, useState } from 'react'
import type { StatementTable } from '../types/statementTable'

const MAX_HISTORY = 50

function cloneTable(table: StatementTable): StatementTable {
  return JSON.parse(JSON.stringify(table)) as StatementTable
}

export function useTableHistory() {
  const [past, setPast] = useState<StatementTable[]>([])
  const [future, setFuture] = useState<StatementTable[]>([])

  const pushSnapshot = useCallback((table: StatementTable) => {
    setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), cloneTable(table)])
    setFuture([])
  }, [])

  const undo = useCallback(
    (current: StatementTable): StatementTable | null => {
      if (past.length === 0) return null
      const prev = past[past.length - 1]
      setPast((p) => p.slice(0, -1))
      setFuture((f) => [cloneTable(current), ...f])
      return prev
    },
    [past],
  )

  const redo = useCallback(
    (current: StatementTable): StatementTable | null => {
      if (future.length === 0) return null
      const next = future[0]
      setFuture((f) => f.slice(1))
      setPast((p) => [...p, cloneTable(current)])
      return next
    },
    [future],
  )

  const reset = useCallback(() => {
    setPast([])
    setFuture([])
  }, [])

  return {
    pushSnapshot,
    undo,
    redo,
    reset,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  }
}
