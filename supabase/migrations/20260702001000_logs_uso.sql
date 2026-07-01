-- =====================================================================
-- LCR · Gestão · logs_uso
--   Rastreia comportamento (leitura/navegação/uso do Cérebro), separado
--   do audit_log (que é auditoria de mudanças). Backing store da tela
--   /gestao/logs (timeline, matriz de produtividade, saúde operacional).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.logs_uso (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_id  uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  acao        text NOT NULL,
  tela        text,
  detalhes    jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_logs_uso_user_time  ON public.logs_uso(user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_logs_uso_client_time ON public.logs_uso(cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_logs_uso_acao_time  ON public.logs_uso(acao, criado_em DESC);

GRANT SELECT, INSERT ON public.logs_uso TO authenticated;
GRANT ALL ON public.logs_uso TO service_role;

ALTER TABLE public.logs_uso ENABLE ROW LEVEL SECURITY;

-- Todos autenticados inserem os próprios eventos
DROP POLICY IF EXISTS p_logs_uso_insert_self ON public.logs_uso;
CREATE POLICY p_logs_uso_insert_self ON public.logs_uso
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Usuário vê os próprios; admin vê todos
DROP POLICY IF EXISTS p_logs_uso_select ON public.logs_uso;
CREATE POLICY p_logs_uso_select ON public.logs_uso
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

COMMENT ON TABLE public.logs_uso IS
  'Eventos de uso do sistema (login, viu_cliente, aprovou_lancamento, gerou_sci, perguntou_cerebro, reportou_oportunidade). Separado de audit_log.';
