-- Biblioteca de Skills do sistema (catálogo global gerenciado pelo fundador).
-- Rode este arquivo no SQL Editor do Supabase.
create table if not exists public.system_skills (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('generation', 'visual', 'camera')),
  title text not null,
  description text default '',
  how_to_use text default '',
  content text not null default '',
  video_url text default '',
  image_url text default '', -- data URL comprimida (thumb dos exemplos)
  copies integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Acesso apenas via service role (servidor) — nenhuma policy pública.
alter table public.system_skills enable row level security;
