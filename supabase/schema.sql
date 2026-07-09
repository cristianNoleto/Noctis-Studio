-- =============================================================================
-- DARK PLANNER — SCHEMA COMPLETO (PostgreSQL / Supabase)
-- Consolidado da spec v2 (seção 20 + tabelas herdadas da v1 citadas na seção 23)
-- =============================================================================

-- --------------------------------------------------------------------------
-- Perfis (espelha auth.users do Supabase)
-- --------------------------------------------------------------------------
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free', -- free | basic | lite | pro | master
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  theme TEXT NOT NULL DEFAULT 'dark', -- dark | light
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Canais operacionais do usuário
-- --------------------------------------------------------------------------
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  youtube_channel_id TEXT,
  language TEXT NOT NULL DEFAULT 'pt', -- pt | en | es | de | fr | it | ja
  contact_email TEXT,
  default_post_time TIME,
  weekly_post_frequency INT,
  notes TEXT,
  -- cache das estatísticas reais do YouTube (atualizadas via botão, máx 1x/10min)
  yt_subscribers BIGINT,
  yt_total_views BIGINT,
  yt_stats_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Botões customizados do header do canal (grid de 6 posições)
CREATE TABLE channel_custom_buttons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  position INT NOT NULL, -- 1 a 6
  UNIQUE (channel_id, position)
);

-- Compartilhamento de canal com permissões granulares
-- IMPORTANTE: cada flag DEVE ser validada no backend em toda rota sensível.
CREATE TABLE channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor', -- owner | editor
  permission_edit_config BOOLEAN NOT NULL DEFAULT false,
  permission_edit_prompts BOOLEAN NOT NULL DEFAULT false,
  permission_delete_videos BOOLEAN NOT NULL DEFAULT false,
  permission_edit_references BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

-- --------------------------------------------------------------------------
-- Vídeos do canal (tabela "Títulos & Vídeos")
-- --------------------------------------------------------------------------
CREATE TABLE channel_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'planning', -- planning | production | finished | scheduled | published
  youtube_url TEXT,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roteiros vinculados a vídeos (autosave com debounce ~2s)
CREATE TABLE video_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES channel_videos(id) ON DELETE CASCADE,
  content TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id)
);

-- Relatórios de SEO/CTR gerados por IA (assíncronos via fila)
CREATE TABLE video_seo_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES channel_videos(id) ON DELETE CASCADE,
  score INT CHECK (score BETWEEN 0 AND 100),
  report_json JSONB, -- { strengths, weaknesses, suggestions: { title, thumbnail, description } }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Chaves de API (BYOK)
-- --------------------------------------------------------------------------

-- Múltiplas chaves de YouTube API por usuário, com estado de cota.
-- Rotação: em 403 de cota, marcar exhausted (reset à meia-noite PT) e avançar.
CREATE TABLE youtube_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slot_index INT NOT NULL CHECK (slot_index BETWEEN 1 AND 5),
  encrypted_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | exhausted
  exhausted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot_index)
);

-- Demais chaves BYOK (Gemini, transcrição, Pexels/Pixabay se necessário)
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- gemini | transcription | pexels | pixabay
  encrypted_key TEXT NOT NULL,
  config JSONB, -- ex.: { "model": "gemini-2.0-flash" }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- --------------------------------------------------------------------------
-- Snapshots diários de estatísticas (base do "crescimento mensal" real)
-- --------------------------------------------------------------------------
CREATE TABLE channel_stats_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_channel_id TEXT NOT NULL,
  subscribers BIGINT,
  total_views BIGINT,
  video_count INT,
  snapshot_date DATE NOT NULL DEFAULT current_date,
  UNIQUE (youtube_channel_id, snapshot_date)
);

-- Canais monitorados pelos usuários (alimenta snapshots + detecção de remoção)
CREATE TABLE monitored_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  youtube_channel_id TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | missing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, youtube_channel_id)
);

-- --------------------------------------------------------------------------
-- Dobra de Nicho (análises cacheadas, geradas por IA)
-- --------------------------------------------------------------------------
CREATE TABLE niche_doubling_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_channel_youtube_id TEXT NOT NULL,
  source_channel_name TEXT,
  source_channel_avatar_url TEXT,
  result_json JSONB, -- { dna: [...], ideas: [...], doubling: [...], market: [...] }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Canais Removidos (base pública curada pelo admin)
-- --------------------------------------------------------------------------
CREATE TABLE removed_channels_db (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name TEXT NOT NULL,
  niche TEXT,
  approx_subscribers BIGINT,
  approx_removal_date DATE,
  verified BOOLEAN NOT NULL DEFAULT false,
  added_by_admin UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Quadro de Ideias (kanban com colunas customizáveis)
-- --------------------------------------------------------------------------
CREATE TABLE board_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT,
  position INT NOT NULL DEFAULT 0
);

CREATE TABLE board_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT,
  position INT NOT NULL DEFAULT 0,
  source TEXT, -- manual | niche_finder | viral_videos | niche_doubling
  source_ref JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE board_card_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0
);

-- --------------------------------------------------------------------------
-- Referências (pastas de canais benchmark)
-- --------------------------------------------------------------------------
CREATE TABLE reference_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL, -- canal operacional vinculado
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reference_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES reference_folders(id) ON DELETE CASCADE,
  youtube_url TEXT NOT NULL,
  youtube_channel_id TEXT,
  niche TEXT,
  notes TEXT,
  cached_stats JSONB, -- { name, avatar_url, subscribers, ... } via YouTube API
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Biblioteca de Prompts (categorias editáveis + prompts públicos/privados)
-- --------------------------------------------------------------------------
CREATE TABLE prompt_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0
);

CREATE TABLE prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  category_id UUID REFERENCES prompt_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  notes TEXT,
  suggested_language TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false, -- público = visível para toda a comunidade
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Transcrição (BYOK, fila assíncrona)
-- --------------------------------------------------------------------------
CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- upload | youtube_url
  source_url TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | preparing | transcribing | done | error
  result_json JSONB, -- blocos com timestamps
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Conteúdo institucional / plataforma
-- --------------------------------------------------------------------------
CREATE TABLE academy_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  cover_url TEXT,
  video_embed_url TEXT,
  materials JSONB, -- [{ label, url }]
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  guide_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Caches de busca (economia de cota — a rotação multiplica a cota, não a
-- torna infinita)
-- --------------------------------------------------------------------------
CREATE TABLE youtube_search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE, -- hash dos parâmetros de busca
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE media_search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE, -- provider + query + filtros
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico de gerações de texto por IA (relatórios, dobra de nicho, etc.)
CREATE TABLE text_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- seo_report | niche_doubling | other
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Índices auxiliares
-- --------------------------------------------------------------------------
CREATE INDEX idx_channels_owner ON channels(owner_id);
CREATE INDEX idx_channel_videos_channel ON channel_videos(channel_id);
CREATE INDEX idx_channel_videos_status ON channel_videos(channel_id, status);
CREATE INDEX idx_channel_members_user ON channel_members(user_id);
CREATE INDEX idx_snapshots_channel_date ON channel_stats_snapshots(youtube_channel_id, snapshot_date);
CREATE INDEX idx_board_cards_column ON board_cards(column_id, position);
CREATE INDEX idx_prompts_public ON prompts(is_public) WHERE is_public;
CREATE INDEX idx_transcriptions_user ON transcriptions(user_id);

-- --------------------------------------------------------------------------
-- RLS (Row Level Security) — ativar em todas as tabelas por usuário.
-- Políticas detalhadas serão adicionadas fase a fase; o princípio:
--   * dono acessa tudo que é seu;
--   * membro de canal acessa conforme flags de permissão;
--   * removed_channels_db e academy_content são leitura pública
--     (escrita apenas admin);
--   * prompts públicos são legíveis por qualquer usuário autenticado.
-- --------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_custom_buttons ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_seo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitored_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE niche_doubling_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_card_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE text_generations ENABLE ROW LEVEL SECURITY;
