-- Aprendizado de participante por cliente (proposta Mari, call 06/07).
-- Aplicar no Supabase SQL Editor (convenção Lovable).
--
-- Quando o usuário preenche part_deb/part_cred de um lançamento, o sistema
-- memoriza o padrão (descrição NORMALIZADA + conta + participante) por empresa.
-- No enriquecer-extrato seguinte, transação com a mesma descrição normalizada
-- da mesma empresa recebe autopreenchimento com badge "aprendido" (editável).

CREATE TABLE IF NOT EXISTS public.aprendizado_participante (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  padrao_descricao text NOT NULL,          -- descrição NORMALIZADA (ex.: "PIX ANDRESSA SILVA")
  conta_codigo text,                       -- plano_contas.codigo associado (opcional)
  part_deb text,
  part_cred text,
  frequencia int NOT NULL DEFAULT 1,       -- quantas vezes o padrão foi visto/confirmado
  ultima_ocorrencia timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Chave do aprendizado: 1 padrão por (empresa, descrição normalizada). O upsert
-- em editarLancamento faz ON CONFLICT nesse índice p/ incrementar frequencia.
CREATE UNIQUE INDEX IF NOT EXISTS uq_aprendizado_part
  ON public.aprendizado_participante (empresa_id, padrao_descricao);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aprendizado_participante TO authenticated;
GRANT ALL ON public.aprendizado_participante TO service_role;
ALTER TABLE public.aprendizado_participante ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe LCR acessa aprendizado_participante"
  ON public.aprendizado_participante FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Marca no lançamento quando o participante veio do aprendizado (badge no front).
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS part_aprendido boolean NOT NULL DEFAULT false;
