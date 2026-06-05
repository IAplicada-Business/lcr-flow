
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.regime_tributario AS ENUM ('simples', 'presumido', 'real', 'mei');
CREATE TYPE public.documento_tipo AS ENUM ('extrato', 'nf_entrada', 'nf_saida', 'fatura_cartao', 'recibo', 'darf', 'planilha_financeira', 'movimento_contabil');
CREATE TYPE public.documento_origem AS ENUM ('gestta', 'manual');
CREATE TYPE public.documento_status AS ENUM ('recebido', 'classificado', 'processado', 'conciliado');
CREATE TYPE public.lancamento_status AS ENUM ('gerada', 'upload_leveldrive', 'importada_sci');
CREATE TYPE public.conciliacao_status AS ENUM ('nao_iniciada', 'em_andamento', 'divergencias', 'concluida');
CREATE TYPE public.tarefa_tipo AS ENUM ('cobranca', 'lancamentos', 'conciliacao');
CREATE TYPE public.tarefa_status AS ENUM ('now', 'doing', 'next', 'back', 'done');
CREATE TYPE public.perfil_usuario AS ENUM ('admin', 'consultor', 'assistente');
CREATE TYPE public.empresa_status AS ENUM ('em_dia', 'cobranca', 'lancamento', 'conciliacao', 'entregue', 'atrasado');

-- =========================================
-- TIMESTAMP TRIGGER
-- =========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========================================
-- USUARIOS_PERFIL
-- =========================================
CREATE TABLE public.usuarios_perfil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text,
  perfil public.perfil_usuario NOT NULL DEFAULT 'assistente',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios_perfil TO authenticated;
GRANT ALL ON public.usuarios_perfil TO service_role;
ALTER TABLE public.usuarios_perfil ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perfis visíveis para equipe" ON public.usuarios_perfil FOR SELECT TO authenticated USING (true);
CREATE POLICY "usuário edita próprio perfil" ON public.usuarios_perfil FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perfil inserido no signup" ON public.usuarios_perfil FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_usuarios_perfil_updated BEFORE UPDATE ON public.usuarios_perfil FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.usuarios_perfil (user_id, nome, email, perfil)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)), NEW.email, 'assistente');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- EMPRESAS
-- =========================================
CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  nome_fantasia text,
  cnpj text NOT NULL,
  regime public.regime_tributario NOT NULL DEFAULT 'simples',
  segmento text,
  consultor_id uuid REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  status public.empresa_status NOT NULL DEFAULT 'em_dia',
  tags text[] NOT NULL DEFAULT '{}',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe LCR acessa empresas" ON public.empresas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_empresas_updated BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- CONTAS_BANCARIAS
-- =========================================
CREATE TABLE public.contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  banco text NOT NULL,
  agencia text NOT NULL,
  conta text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_bancarias TO authenticated;
GRANT ALL ON public.contas_bancarias TO service_role;
ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe LCR acessa contas" ON public.contas_bancarias FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- DOCUMENTOS_ESPERADOS
-- =========================================
CREATE TABLE public.documentos_esperados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.documento_tipo NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos_esperados TO authenticated;
GRANT ALL ON public.documentos_esperados TO service_role;
ALTER TABLE public.documentos_esperados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe LCR acessa docs esperados" ON public.documentos_esperados FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- DOCUMENTOS
-- =========================================
CREATE TABLE public.documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.documento_tipo NOT NULL,
  competencia text NOT NULL, -- 'YYYY-MM'
  origem public.documento_origem NOT NULL DEFAULT 'manual',
  status public.documento_status NOT NULL DEFAULT 'recebido',
  arquivo_url text,
  arquivo_nome text,
  dados_extraidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  responsavel_id uuid REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos TO authenticated;
GRANT ALL ON public.documentos TO service_role;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe LCR acessa documentos" ON public.documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_documentos_updated BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_documentos_empresa ON public.documentos(empresa_id);
CREATE INDEX idx_documentos_competencia ON public.documentos(competencia);

-- =========================================
-- LANCAMENTOS
-- =========================================
CREATE TABLE public.lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  status public.lancamento_status NOT NULL DEFAULT 'gerada',
  planilha_url text,
  total_lancamentos integer NOT NULL DEFAULT 0,
  importado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos TO authenticated;
GRANT ALL ON public.lancamentos TO service_role;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe LCR acessa lancamentos" ON public.lancamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_lancamentos_updated BEFORE UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- CONCILIACOES
-- =========================================
CREATE TABLE public.conciliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  status public.conciliacao_status NOT NULL DEFAULT 'nao_iniciada',
  divergencias_count integer NOT NULL DEFAULT 0,
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, competencia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacoes TO authenticated;
GRANT ALL ON public.conciliacoes TO service_role;
ALTER TABLE public.conciliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe LCR acessa conciliacoes" ON public.conciliacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_conciliacoes_updated BEFORE UPDATE ON public.conciliacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- TAREFAS
-- =========================================
CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.tarefa_tipo NOT NULL,
  status public.tarefa_status NOT NULL DEFAULT 'next',
  titulo text NOT NULL,
  consultor_id uuid REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  prazo date,
  ordem integer NOT NULL DEFAULT 0,
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas TO authenticated;
GRANT ALL ON public.tarefas TO service_role;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe LCR acessa tarefas" ON public.tarefas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_tarefas_updated BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- INTEGRACOES
-- =========================================
CREATE TABLE public.integracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL UNIQUE, -- 'gestta' | 'sci' | 'leveldrive' | 'sharepoint'
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'desconectado',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integracoes TO authenticated;
GRANT ALL ON public.integracoes TO service_role;
ALTER TABLE public.integracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe LCR acessa integracoes" ON public.integracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- SEED [DEMO]
-- =========================================
INSERT INTO public.empresas (razao_social, nome_fantasia, cnpj, regime, segmento, status, tags, is_demo) VALUES
('Padaria Bella Vista LTDA [DEMO]', 'Bella Vista', '12.345.678/0001-90', 'simples', 'Alimentação', 'cobranca', ARRAY['baixo volume'], true),
('Construtora Horizonte SA [DEMO]', 'Horizonte', '23.456.789/0001-01', 'real', 'Construção Civil', 'lancamento', ARRAY['atípico','alto volume'], true),
('Studio Pilates Movimento ME [DEMO]', 'Movimento', '34.567.890/0001-12', 'mei', 'Saúde & Bem-estar', 'em_dia', ARRAY['baixo volume'], true),
('TechFlow Soluções LTDA [DEMO]', 'TechFlow', '45.678.901/0001-23', 'presumido', 'Tecnologia', 'conciliacao', ARRAY['recorrente'], true),
('Restaurante Sabor & Arte LTDA [DEMO]', 'Sabor & Arte', '56.789.012/0001-34', 'simples', 'Alimentação', 'atrasado', ARRAY['atenção'], true),
('Auto Center Veloz LTDA [DEMO]', 'Veloz', '67.890.123/0001-45', 'presumido', 'Automotivo', 'entregue', ARRAY['recorrente'], true);

-- contas bancárias para algumas empresas
INSERT INTO public.contas_bancarias (empresa_id, banco, agencia, conta)
SELECT id, 'Banco do Brasil', '1234-5', '00012345-6' FROM public.empresas WHERE razao_social LIKE 'Padaria Bella Vista%';
INSERT INTO public.contas_bancarias (empresa_id, banco, agencia, conta)
SELECT id, 'Itaú', '4567', '78901-2' FROM public.empresas WHERE razao_social LIKE 'Construtora Horizonte%';
INSERT INTO public.contas_bancarias (empresa_id, banco, agencia, conta)
SELECT id, 'Bradesco', '0987', '34567-8' FROM public.empresas WHERE razao_social LIKE 'TechFlow%';
INSERT INTO public.contas_bancarias (empresa_id, banco, agencia, conta)
SELECT id, 'Santander', '3456', '99887-7' FROM public.empresas WHERE razao_social LIKE 'Restaurante%';

-- documentos esperados (todos os tipos para cada empresa)
INSERT INTO public.documentos_esperados (empresa_id, tipo, obrigatorio)
SELECT e.id, t.tipo::public.documento_tipo, true
FROM public.empresas e
CROSS JOIN (VALUES ('extrato'),('nf_entrada'),('nf_saida'),('fatura_cartao'),('darf'),('planilha_financeira')) AS t(tipo);

-- documentos recebidos (mock)
INSERT INTO public.documentos (empresa_id, tipo, competencia, origem, status, arquivo_nome)
SELECT e.id, 'extrato'::public.documento_tipo, '2026-05', 'gestta'::public.documento_origem, 'processado'::public.documento_status, 'extrato_05_2026.pdf' FROM public.empresas e WHERE is_demo;
INSERT INTO public.documentos (empresa_id, tipo, competencia, origem, status, arquivo_nome)
SELECT e.id, 'nf_saida'::public.documento_tipo, '2026-05', 'gestta'::public.documento_origem, 'classificado'::public.documento_status, 'nfs_05_2026.xml' FROM public.empresas e WHERE is_demo;
INSERT INTO public.documentos (empresa_id, tipo, competencia, origem, status, arquivo_nome)
SELECT e.id, 'nf_entrada'::public.documento_tipo, '2026-05', 'manual'::public.documento_origem, 'recebido'::public.documento_status, 'nfe_05_2026.xml' FROM public.empresas e WHERE razao_social LIKE 'Padaria%' OR razao_social LIKE 'TechFlow%';
INSERT INTO public.documentos (empresa_id, tipo, competencia, origem, status, arquivo_nome)
SELECT e.id, 'fatura_cartao'::public.documento_tipo, '2026-05', 'manual'::public.documento_origem, 'conciliado'::public.documento_status, 'fatura_05_2026.pdf' FROM public.empresas e WHERE razao_social LIKE 'Auto Center%';

-- conciliações
INSERT INTO public.conciliacoes (empresa_id, competencia, status, divergencias_count)
SELECT id, '2026-05',
  CASE status::text
    WHEN 'em_dia' THEN 'concluida'::public.conciliacao_status
    WHEN 'conciliacao' THEN 'em_andamento'::public.conciliacao_status
    WHEN 'atrasado' THEN 'divergencias'::public.conciliacao_status
    WHEN 'entregue' THEN 'concluida'::public.conciliacao_status
    ELSE 'nao_iniciada'::public.conciliacao_status
  END,
  CASE WHEN status = 'atrasado' THEN 4 ELSE 0 END
FROM public.empresas WHERE is_demo;

-- lançamentos
INSERT INTO public.lancamentos (empresa_id, competencia, status, total_lancamentos)
SELECT id, '2026-05', 'gerada'::public.lancamento_status, 42 FROM public.empresas WHERE razao_social LIKE 'TechFlow%';
INSERT INTO public.lancamentos (empresa_id, competencia, status, total_lancamentos)
SELECT id, '2026-04', 'importada_sci'::public.lancamento_status, 38 FROM public.empresas WHERE razao_social LIKE 'Auto Center%';

-- tarefas Kanban
INSERT INTO public.tarefas (empresa_id, tipo, status, titulo, prazo, ordem)
SELECT id, 'cobranca'::public.tarefa_tipo, 'now'::public.tarefa_status, 'Cobrar extrato bancário de maio', CURRENT_DATE + 2, 1 FROM public.empresas WHERE razao_social LIKE 'Padaria%';
INSERT INTO public.tarefas (empresa_id, tipo, status, titulo, prazo, ordem)
SELECT id, 'cobranca'::public.tarefa_tipo, 'doing'::public.tarefa_status, 'Aguardando NF entrada', CURRENT_DATE + 5, 2 FROM public.empresas WHERE razao_social LIKE 'Restaurante%';
INSERT INTO public.tarefas (empresa_id, tipo, status, titulo, prazo, ordem)
SELECT id, 'lancamentos'::public.tarefa_tipo, 'doing'::public.tarefa_status, 'Gerar planilha SCI mensal', CURRENT_DATE + 3, 1 FROM public.empresas WHERE razao_social LIKE 'TechFlow%';
INSERT INTO public.tarefas (empresa_id, tipo, status, titulo, prazo, ordem)
SELECT id, 'lancamentos'::public.tarefa_tipo, 'next'::public.tarefa_status, 'Revisar lançamentos atípicos', CURRENT_DATE + 7, 2 FROM public.empresas WHERE razao_social LIKE 'Construtora%';
INSERT INTO public.tarefas (empresa_id, tipo, status, titulo, prazo, ordem)
SELECT id, 'conciliacao'::public.tarefa_tipo, 'back'::public.tarefa_status, 'Resolver divergências do extrato', CURRENT_DATE - 1, 1 FROM public.empresas WHERE razao_social LIKE 'Restaurante%';
INSERT INTO public.tarefas (empresa_id, tipo, status, titulo, prazo, ordem)
SELECT id, 'conciliacao'::public.tarefa_tipo, 'done'::public.tarefa_status, 'Conciliação concluída', CURRENT_DATE - 3, 1 FROM public.empresas WHERE razao_social LIKE 'Auto Center%';

-- integrações vazias
INSERT INTO public.integracoes (tipo, config, status) VALUES
('gestta', '{"api_key":"","base_url":"https://api.gestta.com.br"}'::jsonb, 'desconectado'),
('sci', '{"url":"","usuario":"","senha":""}'::jsonb, 'desconectado'),
('leveldrive', '{"path":""}'::jsonb, 'desconectado'),
('sharepoint', '{"folder_url":""}'::jsonb, 'desconectado');
