-- OCR：浏览器只上传到 Storage，Edge Function 从 Storage 读取后调 Paddle

alter table ocr_jobs add column if not exists storage_path text;

create policy "ocr_jobs_update_own" on ocr_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('ocr-sources', 'ocr-sources', false)
on conflict (id) do nothing;

create policy "ocr_sources_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ocr-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "ocr_sources_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ocr-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "ocr_sources_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'ocr-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "ocr_sources_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ocr-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
