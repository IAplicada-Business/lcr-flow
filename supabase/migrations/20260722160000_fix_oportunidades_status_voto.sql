-- =====================================================================
-- FIX: Oportunidades — mudar status e votar (joinha) falhavam (Bruno 22/07).
--
-- 1) Trigger de histórico rodava como invoker sem policy INSERT em
--    oportunidade_historico → UPDATE de status abortava a transação.
-- 2) votarOportunidade usa upsert, que exige policy UPDATE em
--    oportunidade_votos — só existiam SELECT/INSERT/DELETE.
-- 3) Qualquer autenticado com acesso à tela pode mudar status (Kanban
--    colaborativo); autor/admin continua podendo editar demais campos.
-- =====================================================================

-- Histórico: trigger precisa gravar mesmo quando o usuário não tem INSERT direto.
CREATE OR REPLACE FUNCTION public.oportunidades_log_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.oportunidade_historico (oportunidade_id, status_anterior, status_novo, mudado_por)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Quem enxerga a tela (authenticated) pode atualizar status/prioridade no Kanban.
DROP POLICY IF EXISTS p_oport_update ON public.oportunidades;
CREATE POLICY p_oport_update ON public.oportunidades
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Votos: upsert (ON CONFLICT DO UPDATE) precisa de UPDATE + policy.
GRANT UPDATE ON public.oportunidade_votos TO authenticated;
DROP POLICY IF EXISTS p_oport_votos_update ON public.oportunidade_votos;
CREATE POLICY p_oport_votos_update ON public.oportunidade_votos
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Histórico: leitura para todos; insert só via trigger SECURITY DEFINER (service/owner).
GRANT SELECT ON public.oportunidade_historico TO authenticated;
