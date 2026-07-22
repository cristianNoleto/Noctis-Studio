-- ===========================================================================
-- Migração localStorage -> Postgres (Fase 1): estende o schema normalizado que
-- já existe para acomodar TODOS os campos do client sem perda de dados.
-- Aplicado ao vivo no projeto Supabase "Noctis Studio site" em 2026-07-21
-- (migrations: extend_channels_videos_for_client_fields,
--  add_extra_jsonb_to_per_user_tables). Mantido aqui para versionamento.
-- ===========================================================================

-- Canais: campos do client que não tinham coluna.
alter table public.channels
  add column if not exists post_times jsonb not null default '[]'::jsonb,
  add column if not exists archived boolean not null default false,
  add column if not exists posted_baseline integer not null default 0,
  add column if not exists frequency_label text,
  add column if not exists extra jsonb not null default '{}'::jsonb;

-- Vídeos: etapas (steps), numeração, data de publicação, importado, briefing da thumb.
alter table public.channel_videos
  add column if not exists steps jsonb not null default '{}'::jsonb,
  add column if not exists video_number integer,
  add column if not exists published_at timestamptz,
  add column if not exists imported boolean not null default false,
  add column if not exists thumbnail_concept text,
  add column if not exists extra jsonb not null default '{}'::jsonb;

-- Catch-all sem perda nas demais tabelas por usuário.
alter table public.prompts add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.prompt_categories add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.board_columns add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.board_cards add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.board_card_checklist_items add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.reference_folders add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.reference_channels add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.channel_custom_buttons add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.channel_members add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.video_seo_reports add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.transcriptions add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.niche_doubling_analyses add column if not exists extra jsonb not null default '{}'::jsonb;

-- Espaços do Quadro de Ideias (boardSpaces) não tinham tabela — criada aqui.
create table if not exists public.board_spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  name text not null,
  position integer not null default 0,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.board_spaces enable row level security;
alter table public.board_columns add column if not exists space_id uuid;
