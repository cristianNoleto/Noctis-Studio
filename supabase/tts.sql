-- Narração (ElevenLabs) — chave central do dono + cota diária por usuário.
-- Tudo aqui é acessado SOMENTE pela service role: RLS ligada e SEM policies, então
-- anon/authenticated não leem nem escrevem; a service role (servidor) ignora a RLS.
-- Já aplicado no projeto "Noctis Studio site"; mantido aqui para versionar o schema.

-- Segredos da plataforma (ex.: a chave do ElevenLabs do dono), guardados CIFRADOS
-- (AES-256-GCM, chave DRIVE_TOKEN_ENC_KEY) pelo servidor. O navegador nunca recebe o valor.
create table if not exists public.platform_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_secrets enable row level security;

-- Uso diário de narração por usuário (1 geração bem-sucedida = 1 áudio).
create table if not exists public.tts_usage (
  user_id uuid not null,
  day date not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.tts_usage enable row level security;

-- Config NÃO-secreta da narração (ligado/desligado, limite diário, plano mínimo,
-- modelo padrão). Fica em app_state (leitura liberada) — nada sensível aqui.
insert into public.app_state (key, value)
values ('tts_config', '{"enabled": false, "dailyLimit": 30, "minPlan": "BASIC", "modelId": "eleven_multilingual_v2"}'::jsonb)
on conflict (key) do nothing;
