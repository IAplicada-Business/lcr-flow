-- =====================================================================
-- LCR · Gestão · Banco de Oportunidades
--   oportunidades: registro de bug / melhoria / dúvida coletado pela
--     persona Reportar do Cérebro (multi-turn conversacional) ou
--     manualmente.
--   oportunidade_votos: priorização democrática interna.
--   oportunidade_comentarios: internos ou públicos.
--   oportunidade_historico: log de mudanças de status.
-- =====================================================================

-- Sequência para gerar número OPT-XXXX
CREATE SEQUENCE IF NOT EXISTS public.oportunidades_num_seq START 1;

CREATE TABLE IF NOT EXISTS public.oportunidades (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                text UNIQUE NOT NULL,
  tipo                  text NOT NULL CHECK (tipo IN ('bug','melhoria','duvida')),
  titulo                text NOT NULL,
  descricao             text NOT NULL,
  tela_origem           text,
  cliente_id            uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  autor_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  impacto               text CHECK (impacto IN ('bloqueia','atrapalha','cosmetico')),
  frequencia_uso        text,
  problema_resolve      text,
  prioridade            text CHECK (prioridade IN ('critica','alta','media','baixa')) DEFAULT 'media',
  status                text CHECK (status IN ('aberto','em_analise','planejado','em_dev','entregue','descartado')) DEFAULT 'aberto',
  cerebro_conversa_id   uuid,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_oportunidades_status  ON public.oportunidades(status);
CREATE INDEX IF NOT EXISTS ix_oportunidades_tipo    ON public.oportunidades(tipo);
CREATE INDEX IF NOT EXISTS ix_oportunidades_autor   ON public.oportunidades(autor_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_oportunidades_cliente ON public.oportunidades(cliente_id);

-- Trigger: gera numero automaticamente se não vier preenchido
CREATE OR REPLACE FUNCTION public.oportunidades_gera_numero()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL OR btrim(NEW.numero) = '' THEN
    NEW.numero := 'OPT-' || lpad(nextval('public.oportunidades_num_seq')::text, 4, '0');
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oportunidades_numero ON public.oportunidades;
CREATE TRIGGER trg_oportunidades_numero
  BEFORE INSERT OR UPDATE ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.oportunidades_gera_numero();

-- Votos ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oportunidade_votos (
  oportunidade_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  votado_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (oportunidade_id, user_id)
);

-- Comentários ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oportunidade_comentarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  autor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo            text NOT NULL CHECK (tipo IN ('interno','publico')) DEFAULT 'interno',
  conteudo        text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_oport_com_oport ON public.oportunidade_comentarios(oportunidade_id, criado_em);

-- Histórico de status ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oportunidade_historico (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo     text NOT NULL,
  mudado_por      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mudado_em       timestamptz NOT NULL DEFAULT now(),
  comentario      text
);
CREATE INDEX IF NOT EXISTS ix_oport_hist_oport ON public.oportunidade_historico(oportunidade_id, mudado_em);

-- Trigger: registra histórico automaticamente quando status muda
CREATE OR REPLACE FUNCTION public.oportunidades_log_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.oportunidade_historico (oportunidade_id, status_anterior, status_novo, mudado_por)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oportunidades_status ON public.oportunidades;
CREATE TRIGGER trg_oportunidades_status
  AFTER UPDATE OF status ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.oportunidades_log_status();

-- Grants + RLS -----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.oportunidades TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.oportunidade_votos TO authenticated;
GRANT SELECT, INSERT ON public.oportunidade_comentarios TO authenticated;
GRANT SELECT ON public.oportunidade_historico TO authenticated;
GRANT ALL ON public.oportunidades, public.oportunidade_votos,
             public.oportunidade_comentarios, public.oportunidade_historico TO service_role;

ALTER TABLE public.oportunidades          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidade_votos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidade_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidade_historico ENABLE ROW LEVEL SECURITY;

-- Todos autenticados leem oportunidades
DROP POLICY IF EXISTS p_oport_select ON public.oportunidades;
CREATE POLICY p_oport_select ON public.oportunidades
  FOR SELECT TO authenticated USING (true);

-- Autor cria a própria
DROP POLICY IF EXISTS p_oport_insert ON public.oportunidades;
CREATE POLICY p_oport_insert ON public.oportunidades
  FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid());

-- Autor pode editar seu registro enquanto aberto; admin pode qualquer
DROP POLICY IF EXISTS p_oport_update ON public.oportunidades;
CREATE POLICY p_oport_update ON public.oportunidades
  FOR UPDATE TO authenticated
  USING (autor_id = auth.uid() OR public.is_admin())
  WITH CHECK (autor_id = auth.uid() OR public.is_admin());

-- Votos: todos veem, cada um gerencia o próprio
DROP POLICY IF EXISTS p_oport_votos_select ON public.oportunidade_votos;
CREATE POLICY p_oport_votos_select ON public.oportunidade_votos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS p_oport_votos_insert ON public.oportunidade_votos;
CREATE POLICY p_oport_votos_insert ON public.oportunidade_votos
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS p_oport_votos_delete ON public.oportunidade_votos;
CREATE POLICY p_oport_votos_delete ON public.oportunidade_votos
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Comentários: todos autenticados leem; autor insere
DROP POLICY IF EXISTS p_oport_com_select ON public.oportunidade_comentarios;
CREATE POLICY p_oport_com_select ON public.oportunidade_comentarios
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS p_oport_com_insert ON public.oportunidade_comentarios;
CREATE POLICY p_oport_com_insert ON public.oportunidade_comentarios
  FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());

-- Histórico: só leitura
DROP POLICY IF EXISTS p_oport_hist_select ON public.oportunidade_historico;
CREATE POLICY p_oport_hist_select ON public.oportunidade_historico
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.oportunidades IS
  'Banco de oportunidades (bug/melhoria/dúvida) coletadas pela persona Reportar do Cérebro ou registro manual. Kanban em /gestao/oportunidades.';
