import { getSupabase, isSupabaseConfigured } from './supabase'
import type { PersistedProject, ProjectSummary } from './projectStorage'

export async function upsertCloudProject(snapshot: PersistedProject, userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  const { error } = await supabase.from('project_snapshots').upsert(
    {
      user_id: userId,
      project_id: snapshot.projectId,
      project_name: snapshot.projectName,
      snapshot,
      updated_at: snapshot.updatedAt,
    },
    { onConflict: 'user_id,project_id' },
  )

  if (error) throw new Error(error.message)
}

export async function listCloudProjects(): Promise<ProjectSummary[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('project_snapshots')
    .select('project_id, project_name, snapshot, updated_at')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const snapshot = row.snapshot as PersistedProject
    return {
      projectId: row.project_id as string,
      projectName: (row.project_name as string) || snapshot.projectName,
      currentStep: snapshot.currentStep,
      fileCount: snapshot.files?.length ?? 0,
      transactionCount: snapshot.transactions?.length ?? 0,
      reportCount: snapshot.reports?.length ?? 0,
      updatedAt: (row.updated_at as string) || snapshot.updatedAt,
    }
  })
}

export async function loadCloudProject(projectId: string): Promise<PersistedProject | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('project_snapshots')
    .select('snapshot')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data?.snapshot as PersistedProject | undefined) ?? null
}

export async function deleteCloudProject(projectId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  const { error } = await supabase.from('project_snapshots').delete().eq('project_id', projectId)
  if (error) throw new Error(error.message)
}

export function isCloudSyncEnabled(): boolean {
  return isSupabaseConfigured
}
