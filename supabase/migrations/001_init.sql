-- 银行流水智能分析系统数据库 Schema

create extension if not exists "uuid-ossp";

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null default '未命名项目',
  scenario text check (scenario in ('marriage', 'lending', 'labor', 'partnership', 'general')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists uploaded_files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  filename text not null,
  file_type text not null,
  source_platform text,
  storage_path text,
  ocr_job_id text,
  created_at timestamptz default now()
);

create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  file_id uuid references uploaded_files(id) on delete set null,
  tx_date timestamptz not null,
  counterparty text,
  counterparty_account text,
  summary text,
  amount numeric(18,2) not null,
  direction text check (direction in ('in', 'out')) not null,
  balance numeric(18,2),
  source_platform text,
  is_duplicate boolean default false,
  is_risk boolean default false,
  risk_tags text[] default '{}',
  scenario_tags text[] default '{}',
  raw_data jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_transactions_project on transactions(project_id);
create index if not exists idx_transactions_date on transactions(tx_date);
create index if not exists idx_transactions_counterparty on transactions(counterparty);

create table if not exists subjects (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  accounts text[] default '{}',
  notes text,
  is_tracked boolean default false,
  created_at timestamptz default now()
);

create table if not exists analysis_reports (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  scenario text not null,
  title text,
  content jsonb not null,
  summary text,
  created_at timestamptz default now()
);

alter table projects enable row level security;
alter table uploaded_files enable row level security;
alter table transactions enable row level security;
alter table subjects enable row level security;
alter table analysis_reports enable row level security;

create policy "Allow all for anon" on projects for all using (true) with check (true);
create policy "Allow all for anon" on uploaded_files for all using (true) with check (true);
create policy "Allow all for anon" on transactions for all using (true) with check (true);
create policy "Allow all for anon" on subjects for all using (true) with check (true);
create policy "Allow all for anon" on analysis_reports for all using (true) with check (true);
