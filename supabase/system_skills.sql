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

-- Visibilidade e dono da skill (feature de "quem pode ver"):
--   visibility: 'global' (catálogo oficial, só fundador) | 'workspace' (colaboradores do dono)
--               | 'specific' (lista de e-mails) | 'only_me'
alter table public.system_skills add column if not exists owner_email text default '';
alter table public.system_skills add column if not exists visibility text not null default 'global';
alter table public.system_skills add column if not exists allowed_emails text[] not null default '{}';

-- Acesso apenas via service role (servidor) — nenhuma policy pública.
alter table public.system_skills enable row level security;

-- ---------------------------------------------------------------------------
-- Colaboradores do workspace: o dono (fundador ou plano MASTER) libera acesso
-- às suas skills "workspace" e referências para outro e-mail.
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_collaborators (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  member_email text not null,
  skills text not null default 'view',            -- 'none' | 'view' | 'edit'
  references_access text not null default 'none', -- 'none' | 'view' | 'edit'
  created_at timestamptz not null default now(),
  unique (owner_email, member_email)
);
alter table public.workspace_collaborators enable row level security;
