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
  image_url text default '', -- legado: thumb única (substituída por media)
  media jsonb not null default '[]'::jsonb, -- [{type:'image'|'video', url:dataURL, caption:''}]
  copies integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migração para quem já criou a tabela sem a coluna media:
alter table public.system_skills add column if not exists media jsonb not null default '[]'::jsonb;

-- Acesso apenas via service role (servidor) — nenhuma policy pública.
alter table public.system_skills enable row level security;
