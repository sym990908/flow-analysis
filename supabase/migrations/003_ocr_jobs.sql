-- OCR 异步任务（Edge Function 后台轮询 Paddle，前端只查表）

create table if not exists ocr_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text,
  image_bytes int,
  paddle_job_id text,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  progress int not null default 0 check (progress >= 0 and progress <= 100),
  result jsonb,
  error text,
  phase text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ocr_jobs_user on ocr_jobs(user_id);
create index if not exists idx_ocr_jobs_status on ocr_jobs(status);

alter table ocr_jobs enable row level security;

create policy "ocr_jobs_select_own" on ocr_jobs
  for select using (auth.uid() = user_id);
create policy "ocr_jobs_insert_own" on ocr_jobs
  for insert with check (auth.uid() = user_id);

drop trigger if exists ocr_jobs_updated_at on ocr_jobs;
create trigger ocr_jobs_updated_at
  before update on ocr_jobs
  for each row execute function set_updated_at();
