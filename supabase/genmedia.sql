-- Geração de Imagem/Vídeo pela API oficial do Google (Gemini API / Imagen + Veo).
-- A chave é do dono e fica em platform_secrets (key='google_api_key'), cifrada.
-- RLS ligada e SEM policies nas tabelas de uso/jobs → só a service role (servidor)
-- acessa; o servidor valida a posse (user_id) em cada consulta.
-- Já aplicado no projeto "Noctis Studio site"; versionado aqui.

-- Uso diário por usuário, separando imagem e vídeo (vídeo é bem mais caro).
create table if not exists public.genmedia_usage (
  user_id uuid not null,
  day date not null,
  image_count integer not null default 0,
  video_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.genmedia_usage enable row level security;

-- Jobs de vídeo (Veo é assíncrono: submete → poll → baixa). 1 linha por geração.
create table if not exists public.media_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,                       -- 'video'
  status text not null default 'pending',   -- pending | processing | done | failed
  operation text,                           -- nome da operação long-running do Google
  prompt text,
  params jsonb not null default '{}'::jsonb,
  result_uri text,                          -- URI do mp4 pronto (baixado com a chave)
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.media_jobs enable row level security;
create index if not exists media_jobs_user_kind_status_idx on public.media_jobs (user_id, kind, status);

-- Config não-secreta (ligado, limites, plano mínimo, modelos, concorrência).
insert into public.app_state (key, value)
values ('genmedia_config', '{"enabled": false, "imageLimit": 30, "videoLimit": 5, "minPlan": "BASIC", "imageModel": "gemini-2.5-flash-image", "videoModel": "veo-3.1-generate-preview", "maxConcurrentVideos": 3}'::jsonb)
on conflict (key) do nothing;
