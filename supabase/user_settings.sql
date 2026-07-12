-- Chaves de API por usuário, sincronizadas entre navegadores/dispositivos.
-- Cada usuário só enxerga/edita a PRÓPRIA linha (RLS via auth.uid()).
-- Rode este bloco uma vez no SQL Editor do Supabase.

create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  keys       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings select own" on public.user_settings;
create policy "user_settings select own" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "user_settings insert own" on public.user_settings;
create policy "user_settings insert own" on public.user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings update own" on public.user_settings;
create policy "user_settings update own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
