-- Auth、RLS、异步报告任务、云端项目快照

-- 项目归属用户
alter table projects add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists idx_projects_user on projects(user_id);

-- 异步 LLM 报告任务
create table if not exists report_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  scenario text not null check (scenario in ('marriage', 'lending', 'labor', 'partnership', 'general')),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  progress int not null default 0 check (progress >= 0 and progress <= 100),
  scope_snapshot jsonb not null default '{}',
  payload jsonb not null default '{}',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_report_jobs_user on report_jobs(user_id);
create index if not exists idx_report_jobs_status on report_jobs(status);

-- 云端项目快照（与前端 PersistedProject 结构对应）
create table if not exists project_snapshots (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  project_name text not null default '未命名项目',
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, project_id)
);

create index if not exists idx_project_snapshots_user on project_snapshots(user_id);

-- 移除匿名全开放策略
drop policy if exists "Allow all for anon" on projects;
drop policy if exists "Allow all for anon" on uploaded_files;
drop policy if exists "Allow all for anon" on transactions;
drop policy if exists "Allow all for anon" on subjects;
drop policy if exists "Allow all for anon" on analysis_reports;

-- projects：仅本人
create policy "projects_select_own" on projects
  for select using (auth.uid() = user_id);
create policy "projects_insert_own" on projects
  for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects_delete_own" on projects
  for delete using (auth.uid() = user_id);

-- uploaded_files
create policy "uploaded_files_own" on uploaded_files
  for all using (
    exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  );

-- transactions
create policy "transactions_own" on transactions
  for all using (
    exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  );

-- subjects
create policy "subjects_own" on subjects
  for all using (
    exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  );

-- analysis_reports
create policy "analysis_reports_own" on analysis_reports
  for all using (
    exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  );

-- report_jobs：仅本人
alter table report_jobs enable row level security;

create policy "report_jobs_select_own" on report_jobs
  for select using (auth.uid() = user_id);
create policy "report_jobs_insert_own" on report_jobs
  for insert with check (auth.uid() = user_id);
create policy "report_jobs_update_own" on report_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- project_snapshots：仅本人
alter table project_snapshots enable row level security;

create policy "project_snapshots_select_own" on project_snapshots
  for select using (auth.uid() = user_id);
create policy "project_snapshots_insert_own" on project_snapshots
  for insert with check (auth.uid() = user_id);
create policy "project_snapshots_update_own" on project_snapshots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "project_snapshots_delete_own" on project_snapshots
  for delete using (auth.uid() = user_id);

-- updated_at 触发器
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists report_jobs_updated_at on report_jobs;
create trigger report_jobs_updated_at
  before update on report_jobs
  for each row execute function set_updated_at();

drop trigger if exists project_snapshots_updated_at on project_snapshots;
create trigger project_snapshots_updated_at
  before update on project_snapshots
  for each row execute function set_updated_at();
