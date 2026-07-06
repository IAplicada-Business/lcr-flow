-- Painel de qualidade da carteira (Cleiton, call 06/07): separar a carteira por
-- grau de confiança da IA p/ distribuir trabalho. Média de confidence dos
-- lançamentos do mês por empresa. Aplicar no Supabase SQL Editor (convenção Lovable).
--
-- Agregação no banco (não puxar milhares de lançamentos p/ o server fn). Só conta
-- lançamentos com confidence NÃO-NULO (a IA preenche; manual/validado fica null e
-- não deve puxar a média). Empresa sem nenhum lançamento-com-confidence no período
-- simplesmente não aparece no resultado (= "sem dados", fora das faixas).

CREATE OR REPLACE FUNCTION public.qualidade_carteira(p_competencias text[])
RETURNS TABLE (empresa_id uuid, media numeric, n integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.empresa_id, AVG(l.confidence)::numeric AS media, COUNT(*)::integer AS n
  FROM public.lancamentos l
  WHERE l.competencia = ANY(p_competencias) AND l.confidence IS NOT NULL
  GROUP BY l.empresa_id;
$$;
GRANT EXECUTE ON FUNCTION public.qualidade_carteira(text[]) TO authenticated, service_role;
