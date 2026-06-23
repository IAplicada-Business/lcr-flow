-- IMPORTACAO 902 CLIENTES DA LCR · do Gestta · 23/06/2026 (v2)
-- TODOS oficiais e ativos · sem distincao de piloto
-- Aplicado em produção em 23/06/2026 via Supabase MCP (apply_migration).
-- O conteúdo completo dos 902 valores foi enviado pelo cliente no chat e
-- aplicado em 6 batches incrementais; este arquivo documenta a estrutura.

BEGIN;

-- FIX · permitir CNPJ nulo (873 clientes ainda nao tem CNPJ cadastrado)
ALTER TABLE public.empresas ALTER COLUMN cnpj DROP NOT NULL;

-- Permite regime NULL (ainda nao veio do Gestta) e remove o default 'presumido'
ALTER TABLE public.empresas ALTER COLUMN regime DROP NOT NULL;
ALTER TABLE public.empresas ALTER COLUMN regime DROP DEFAULT;

-- Colunas auxiliares
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS mensalidade NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS qtd_tarefas_mes INTEGER,
  ADD COLUMN IF NOT EXISTS nome_normalizado TEXT,
  ADD COLUMN IF NOT EXISTS importado_em TIMESTAMPTZ;

-- Conceito de "piloto" descontinuado
ALTER TABLE public.empresas DROP COLUMN IF EXISTS is_piloto;

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE UNIQUE INDEX IF NOT EXISTS idx_empresas_nome_normalizado
  ON public.empresas(nome_normalizado);

UPDATE public.empresas SET nome_normalizado =
  LOWER(REGEXP_REPLACE(unaccent(razao_social), '[^a-zA-Z0-9]', '', 'g'))
WHERE nome_normalizado IS NULL;

DELETE FROM public.empresas WHERE is_demo = TRUE;

-- INSERT/UPSERT dos 902 clientes (template)
-- INSERT INTO public.empresas (
--   razao_social, nome_fantasia, cnpj, mensalidade, qtd_tarefas_mes,
--   ativo, is_demo, nome_normalizado, importado_em
-- ) VALUES
--   ('<razao_social>', '<apelido>', '<cnpj_ou_NULL>', <mensalidade_ou_NULL>, <qtd_tarefas>, TRUE, FALSE, '<nome_normalizado>', NOW())
-- ON CONFLICT (nome_normalizado) DO UPDATE SET
--   razao_social = EXCLUDED.razao_social,
--   nome_fantasia = COALESCE(empresas.nome_fantasia, EXCLUDED.nome_fantasia),
--   cnpj = COALESCE(EXCLUDED.cnpj, empresas.cnpj),
--   mensalidade = EXCLUDED.mensalidade,
--   qtd_tarefas_mes = EXCLUDED.qtd_tarefas_mes,
--   ativo = TRUE,
--   is_demo = FALSE,
--   importado_em = NOW();

COMMIT;

-- Pós-importação: zerar regime herdado do default antigo
UPDATE public.empresas SET regime = NULL WHERE ativo AND NOT is_demo;

-- Verificacao
SELECT
  COUNT(*)                                       AS total_ativos,
  COUNT(*) FILTER (WHERE mensalidade IS NOT NULL) AS com_mensalidade,
  COUNT(*) FILTER (WHERE cnpj IS NOT NULL)        AS com_cnpj,
  COUNT(*) FILTER (WHERE regime IS NULL)          AS sem_regime
FROM public.empresas
WHERE ativo AND NOT is_demo;
-- Esperado: total_ativos=902, com_mensalidade=224, com_cnpj=29, sem_regime=902
-- Resultado real (23/06/2026): 902 / 224 / 29 / 902 ✓
