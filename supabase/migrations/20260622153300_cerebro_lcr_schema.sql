-- Cérebro LCR · schema dos três pilares (Base de Conhecimento, Consultivo, CX)
-- Onda 1. Ajuste ao schema real: empresas.id é UUID (não BIGINT) — todos os
-- empresa_id usam UUID. pgvector habilitado para a busca semântica da Onda 2.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ====================================================================
-- 1. Pilar Base de Conhecimento
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.kb_processos (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  area TEXT NOT NULL,
  descricao TEXT,
  link_execucao TEXT,
  video_url TEXT,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kb_processo_passos (
  id BIGSERIAL PRIMARY KEY,
  processo_id BIGINT REFERENCES public.kb_processos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kb_articles (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  conteudo_markdown TEXT NOT NULL,
  categoria TEXT,
  tags TEXT[],
  autor_id UUID REFERENCES auth.users(id),
  processo_id BIGINT REFERENCES public.kb_processos(id),
  embedding extensions.vector(1536),
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kb_videos (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  url TEXT NOT NULL,
  categoria TEXT,
  processo_id BIGINT REFERENCES public.kb_processos(id),
  duracao_segundos INTEGER,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_processos_area ON public.kb_processos(area);
CREATE INDEX IF NOT EXISTS idx_kb_articles_categoria ON public.kb_articles(categoria);
CREATE INDEX IF NOT EXISTS idx_kb_articles_tags ON public.kb_articles USING GIN(tags);

-- ====================================================================
-- 2. Pilar Consultivo
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.consultive_snapshots (
  id BIGSERIAL PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) NOT NULL,
  periodo DATE NOT NULL,
  receita_total NUMERIC(14,2),
  despesa_total NUMERIC(14,2),
  margem_bruta NUMERIC(5,2),
  liquidez_corrente NUMERIC(5,2),
  endividamento NUMERIC(5,2),
  variacao_mes_anterior NUMERIC(5,2),
  metadados JSONB,
  calculado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, periodo)
);

CREATE TABLE IF NOT EXISTS public.consultive_insights (
  id BIGSERIAL PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) NOT NULL,
  tipo TEXT NOT NULL,
  severidade TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  sugestao_acao TEXT,
  valor_estimado NUMERIC(14,2),
  status TEXT DEFAULT 'aberto',
  prazo DATE,
  criado_por_ia BOOLEAN DEFAULT TRUE,
  contexto_fonte JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.consultive_benchmarks (
  id BIGSERIAL PRIMARY KEY,
  cnae TEXT NOT NULL,
  indicador TEXT NOT NULL,
  valor_mediano NUMERIC(10,4),
  percentil_25 NUMERIC(10,4),
  percentil_75 NUMERIC(10,4),
  fonte TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cnae, indicador)
);

CREATE INDEX IF NOT EXISTS idx_consultive_snapshots_empresa ON public.consultive_snapshots(empresa_id, periodo DESC);
CREATE INDEX IF NOT EXISTS idx_consultive_insights_empresa ON public.consultive_insights(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_consultive_insights_severidade ON public.consultive_insights(severidade);

-- ====================================================================
-- 3. Pilar CX · Experiência
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.cx_touchpoints (
  id BIGSERIAL PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) NOT NULL,
  tipo TEXT NOT NULL,
  canal TEXT,
  descricao TEXT,
  usuario_lcr_id UUID REFERENCES auth.users(id),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cx_nps_responses (
  id BIGSERIAL PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  comentario TEXT,
  categoria TEXT,
  periodo DATE NOT NULL,
  respondido_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cx_health_score (
  id BIGSERIAL PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) NOT NULL,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  fatores JSONB,
  tendencia TEXT,
  classificacao TEXT,
  calculado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id)
);

CREATE TABLE IF NOT EXISTS public.cx_engagement_events (
  id BIGSERIAL PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) NOT NULL,
  evento TEXT NOT NULL,
  peso NUMERIC(3,2) DEFAULT 1.0,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cx_touchpoints_empresa ON public.cx_touchpoints(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cx_nps_responses_empresa ON public.cx_nps_responses(empresa_id, periodo DESC);
CREATE INDEX IF NOT EXISTS idx_cx_health_score_classificacao ON public.cx_health_score(classificacao);
CREATE INDEX IF NOT EXISTS idx_cx_engagement_empresa ON public.cx_engagement_events(empresa_id, created_at DESC);

-- ====================================================================
-- 4. Compartilhada · histórico do Cérebro
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.cerebro_interactions (
  id BIGSERIAL PRIMARY KEY,
  persona TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  empresa_id UUID REFERENCES public.empresas(id),
  pergunta TEXT NOT NULL,
  resposta TEXT,
  fontes_consultadas JSONB,
  tokens_usados INTEGER,
  modelo TEXT,
  duracao_ms INTEGER,
  util BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cerebro_interactions_persona ON public.cerebro_interactions(persona, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cerebro_interactions_usuario ON public.cerebro_interactions(usuario_id, created_at DESC);

-- ====================================================================
-- 5. RLS
--   SELECT liberado para authenticated; escrita também para authenticated
--   (MVP — pode ser endurecido por perfil depois). Edge functions usam
--   service_role e ignoram RLS; seeds rodam como postgres.
-- ====================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kb_processos','kb_processo_passos','kb_articles','kb_videos',
    'consultive_snapshots','consultive_insights','consultive_benchmarks',
    'cx_touchpoints','cx_nps_responses','cx_health_score','cx_engagement_events',
    'cerebro_interactions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (TRUE);', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);', t || '_write', t);
  END LOOP;
END $$;

-- kb_articles: SELECT só dos ativos
DROP POLICY IF EXISTS kb_articles_select ON public.kb_articles;
CREATE POLICY kb_articles_select ON public.kb_articles FOR SELECT TO authenticated USING (ativo = TRUE);
