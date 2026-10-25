create extension if not exists pgcrypto;

create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  student_key text not null,
  class_id text not null,
  class_name_snapshot text not null default '',
  title text not null,
  description text not null default '',
  source_type text not null,
  source_id text not null,
  original_url text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  material_kind text not null default 'resource',
  capture_status text not null default 'link_only',
  captured_at timestamptz,
  source_created_at timestamptz,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_materials_capture_status_check check (
    capture_status in ('stored','text_captured','transcript','link_only','extraction_pending','extraction_failed','file_unavailable')
  ),
  constraint study_materials_source_unique unique (owner_user_id, student_key, class_id, source_type, source_id)
);

create index if not exists study_materials_student_class_idx
  on public.study_materials(owner_user_id, student_key, class_id, class_name_snapshot, title);
create index if not exists study_materials_source_idx on public.study_materials(source_type, source_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists study_materials_touch_updated_at on public.study_materials;
create trigger study_materials_touch_updated_at before update on public.study_materials
for each row execute function public.touch_updated_at();

alter table public.study_materials enable row level security;

drop policy if exists study_materials_select_own on public.study_materials;
create policy study_materials_select_own on public.study_materials for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists study_materials_insert_own on public.study_materials;
create policy study_materials_insert_own on public.study_materials for insert to authenticated with check (owner_user_id = auth.uid());
drop policy if exists study_materials_update_own on public.study_materials;
create policy study_materials_update_own on public.study_materials for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists study_materials_delete_own on public.study_materials;
create policy study_materials_delete_own on public.study_materials for delete to authenticated using (owner_user_id = auth.uid());
