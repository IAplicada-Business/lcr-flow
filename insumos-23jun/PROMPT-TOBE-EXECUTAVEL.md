# Tarefa: Configurar TO-BE executável no lcr-flow · sem integrações Gestta/SCI

Você está no repositório `mmarques30/lcr-flow`. Stack: React + TanStack Start + Vite + TypeScript + Tailwind + shadcn/ui + Supabase + Bun.

**Contexto:** os dados reais já estão no banco (29 clientes, 1187 contas, 559 históricos, 203 lançamentos demo · PR #18 mergeada). As integrações Gestta/SCI virão na próxima sprint. Para a reunião de validação 23/06, precisamos que o sistema processe documentos **uploaded manualmente** com o mesmo pipeline que rodará em produção quando o Gestta estiver plugado.

**Missão:** configurar o pipeline ponta a ponta — upload → classificação IA → criação de lançamentos → conciliação assistida → planilha SCI — usando documentos exemplo que serão enviados manualmente pela tela do sistema.

---

## Tarefa 1 · Storage bucket para documentos

Criar bucket `documentos-clientes` com RLS apropriada.

`supabase/migrations/${TS}_storage_documentos_clientes.sql`:

```sql
-- Bucket privado para documentos dos clientes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-clientes',
  'documentos-clientes',
  FALSE,
  10485760,                       -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- RLS · authenticated pode fazer SELECT em documentos da sua empresa
CREATE POLICY "Authenticated read documentos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-clientes');

-- RLS · authenticated pode fazer UPLOAD
CREATE POLICY "Authenticated upload documentos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-clientes');

-- RLS · authenticated pode fazer UPDATE/DELETE de seus uploads
CREATE POLICY "Authenticated update documentos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos-clientes');
```

Estrutura de path adotada: `{empresa_id}/{ano-mes}/{tipo}/{filename}`.
Ex.: `cava-uuid/2026-06/extrato/extrato-itau-jun2026.pdf`.

**Critério de aceite:** bucket aparece em `storage.buckets`, policies aplicadas, upload manual via Studio funciona.

---

## Tarefa 2 · Adaptar tabela `documentos` para storage real

Hoje o upload manual só grava metadado. Precisa gravar bytes e linkar.

```sql
-- Adicionar colunas se não existirem
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS tamanho_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS hash_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS classificacao_ia JSONB,
  ADD COLUMN IF NOT EXISTS status_processamento TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS processado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lancamentos_gerados INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_documentos_status ON public.documentos(status_processamento);
CREATE INDEX IF NOT EXISTS idx_documentos_empresa ON public.documentos(empresa_id, created_at DESC);
```

Valores possíveis de `status_processamento`:
- `pendente` — upload feito, ainda não processado
- `processando` — edge function em execução
- `classificado` — IA classificou, lançamentos criados (ou em revisão)
- `erro` — falha no processamento (com mensagem em `classificacao_ia.error`)
- `revisado` — operador revisou e aprovou

---

## Tarefa 3 · Edge function `processar-documento`

`supabase/functions/processar-documento/index.ts`

Esta é a edge function central do pipeline. Recebe um `documento_id`, lê o PDF do storage, manda pro Claude Sonnet 4.6 com prompt especializado, recebe classificação estruturada e cria os lançamentos correspondentes.

```typescript
// Pseudo-código de referência · adaptar à estrutura do repo

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk";

const SYSTEM_PROMPT = `Você é o classificador de documentos contábeis da LCR.

Sua tarefa é analisar um documento PDF enviado por um cliente da contabilidade e:
1. Identificar o TIPO do documento entre: 'extrato_bancario', 'nfe_servico', 'nfe_produto', 'planilha_financeira', 'darf', 'guia_inss_fgts', 'recibo', 'fatura', 'comprovante', 'outro'
2. Extrair os DADOS estruturados relevantes
3. Sugerir LANÇAMENTOS contábeis correspondentes, cada um com:
   - data_lancamento (ISO YYYY-MM-DD)
   - valor (numeric, sempre positivo)
   - tipo_movimento ('debito' ou 'credito')
   - conta_codigo (código de conta do plano de contas LCR — use as contas analíticas, folhas da árvore)
   - historico_codigo (código de histórico padrão)
   - descricao (texto livre, máximo 200 caracteres)

REGRAS IMPORTANTES:
- Use exclusivamente contas e históricos que existem no plano de contas LCR (passados no contexto)
- Para extrato bancário: cada movimentação vira um lançamento
- Para NF-e: separe receita do serviço + retenção de impostos em lançamentos distintos
- Para planilha financeira: cada linha pode virar 1 ou mais lançamentos
- Para DARF/GPS: 1 lançamento de despesa tributária
- Para recibo: 1 lançamento de despesa operacional
- Se não tiver certeza da conta exata, escolha a conta de grupo correto (Despesa/Receita/Ativo/Passivo) mais próxima e marque confidence < 0.7

Retorne JSON estrito no formato:
{
  "tipo_documento": "extrato_bancario",
  "cliente_identificado": "CAVA DESENVOLVIMENTO HUMANO LTDA",
  "competencia": "2026-06",
  "confidence_geral": 0.92,
  "dados_extraidos": { /* livre, depende do tipo */ },
  "lancamentos_sugeridos": [
    {
      "data_lancamento": "2026-06-03",
      "valor": 8500.00,
      "tipo_movimento": "credito",
      "conta_codigo": "01.1.1.02.001",
      "historico_codigo": "TED-REC",
      "descricao": "TED recebida de cliente PJ",
      "confidence": 0.95
    }
    // ... mais lançamentos
  ],
  "observacoes": "string com avisos ou pontos de atenção"
}`;

serve(async (req) => {
  const { documento_id } = await req.json();
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  // 1. Buscar documento
  const { data: doc } = await supabase
    .from('documentos')
    .select('*, empresa:empresas(*)')
    .eq('id', documento_id)
    .single();
  
  // 2. Marcar como processando
  await supabase
    .from('documentos')
    .update({ status_processamento: 'processando' })
    .eq('id', documento_id);
  
  // 3. Baixar arquivo do storage
  const { data: fileData } = await supabase.storage
    .from('documentos-clientes')
    .download(doc.storage_path);
  
  const base64File = await blobToBase64(fileData);
  
  // 4. Carregar contexto: plano de contas + históricos
  const { data: contas } = await supabase
    .from('plano_contas')
    .select('codigo, descricao, tipo')
    .eq('ativo', true);
  
  const { data: historicos } = await supabase
    .from('historicos_contabeis')
    .select('codigo, descricao');
  
  const contextoMsg = `Plano de contas (${contas.length} contas):\n${contas.map(c => `${c.codigo} | ${c.descricao} | ${c.tipo}`).join('\n')}\n\nHistóricos (${historicos.length}):\n${historicos.map(h => `${h.codigo} | ${h.descricao}`).join('\n')}`;
  
  // 5. Chamar Claude com PDF
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64File } },
        { type: "text", text: `Empresa atual: ${doc.empresa.razao_social} (CNPJ ${doc.empresa.cnpj}).\n\n${contextoMsg}\n\nClassifique este documento e sugira os lançamentos.` }
      ]
    }]
  });
  
  // 6. Parsear resposta JSON
  const classificacao = JSON.parse(response.content[0].text);
  
  // 7. Criar lançamentos no banco
  let lancCriados = 0;
  for (const sug of classificacao.lancamentos_sugeridos) {
    const conta = await supabase.from('plano_contas').select('id').eq('codigo', sug.conta_codigo).single();
    const historico = await supabase.from('historicos_contabeis').select('id').eq('codigo', sug.historico_codigo).single();
    
    if (conta.data && historico.data) {
      await supabase.from('lancamentos').insert({
        empresa_id: doc.empresa_id,
        conta_id: conta.data.id,
        historico_id: historico.data.id,
        data_lancamento: sug.data_lancamento,
        valor: sug.valor,
        descricao: sug.descricao,
        competencia: classificacao.competencia,
        status: 'gerada',
      });
      lancCriados++;
    }
  }
  
  // 8. Atualizar documento
  await supabase
    .from('documentos')
    .update({
      status_processamento: 'classificado',
      classificacao_ia: classificacao,
      processado_em: new Date().toISOString(),
      lancamentos_gerados: lancCriados,
    })
    .eq('id', documento_id);
  
  return new Response(JSON.stringify({ ok: true, lancamentos_gerados: lancCriados, classificacao }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
```

Variáveis de ambiente necessárias: `ANTHROPIC_API_KEY`.

**Critério de aceite:** chamar via curl com um `documento_id` válido retorna lançamentos criados. Verificar no banco: registros em `lancamentos` aparecem com os campos corretos.

---

## Tarefa 4 · Tela de upload funcional

Localizar a página de Documentos (`src/routes/clients/$id/documentos.tsx` ou similar) e implementar upload real.

Comportamento esperado:

1. Operador escolhe a empresa (ou já está no contexto do cliente)
2. Drag-and-drop ou seleção de arquivo PDF/JPG/PNG (max 10MB)
3. Confirmação: nome do arquivo + tipo declarado (opcional · default 'auto-detectar')
4. Upload pro bucket `documentos-clientes` na estrutura `{empresa_id}/{ano-mes}/auto/{filename}`
5. Insert no `documentos` com `status_processamento = 'pendente'`
6. Disparo automático da edge function `processar-documento`
7. UI mostra spinner "Processando..." enquanto status = 'processando'
8. Quando status muda para 'classificado': mostra resumo (tipo identificado, N lançamentos gerados, link "Ver lançamentos")

Componente sugerido em `src/components/DocumentUpload.tsx` usando shadcn/ui Dialog ou Sheet.

**Critério de aceite:** upload manual de um PDF gera registro no banco + arquivo no storage + chamada à edge function + lançamentos criados visíveis em até 30 segundos.

---

## Tarefa 5 · Tela de revisão de classificação

Após processamento, operador precisa revisar e aprovar/ajustar.

Rota: `src/routes/documents/$id/revisar.tsx`

Layout:
- Visualizador do PDF original à esquerda (iframe ou pdf.js)
- À direita: classificação extraída, dados estruturados, lista de lançamentos sugeridos
- Cada lançamento sugerido tem checkbox (incluir/excluir) e campos editáveis (conta, histórico, valor)
- Botão "Aprovar e gerar lançamentos definitivos"
- Botão "Reclassificar com IA" (re-roda edge function)

Quando aprovado, atualiza `status_processamento = 'revisado'`.

---

## Tarefa 6 · Fix da planilha SCI (gap conhecido)

A geração da planilha SCI ainda usa total aleatório. Substituir por agregação real:

```typescript
// supabase/functions/gerar-planilha-sci/index.ts ou função equivalente
const { data: agregacao } = await supabase.rpc('agregar_lancamentos_sci', {
  p_empresa_id: empresa_id,
  p_competencia: competencia,
});
```

Função SQL helper:

```sql
CREATE OR REPLACE FUNCTION agregar_lancamentos_sci(p_empresa_id UUID, p_competencia TEXT)
RETURNS TABLE (
  conta_codigo TEXT,
  conta_descricao TEXT,
  conta_tipo TEXT,
  total NUMERIC,
  qtd_lancamentos INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.codigo,
    pc.descricao,
    pc.tipo::text,
    SUM(l.valor)::numeric AS total,
    COUNT(*)::integer AS qtd_lancamentos
  FROM public.lancamentos l
  JOIN public.plano_contas pc ON pc.id = l.conta_id
  WHERE l.empresa_id = p_empresa_id
    AND l.competencia = p_competencia
  GROUP BY pc.codigo, pc.descricao, pc.tipo
  ORDER BY pc.codigo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

O CSV/Excel exportado precisa refletir exatamente o que está na tela de conciliação.

**Critério de aceite:** "Gerar planilha SCI" produz arquivo com mesmos números visíveis na tela. Soma dos lançamentos por conta bate.

---

## Tarefa 7 · Tela de conciliação assistida sobre dados reais

A conciliação deve apresentar os lançamentos criados pelo upload (ou pelos 203 demo) e permitir:

- Visualizar todos os lançamentos da competência por empresa
- Filtrar por conta, tipo, status
- Marcar lançamentos como conciliados (toggle)
- Sinalizar divergências (alerta IA pontual · regra simples para a Onda 1: lançamentos com confidence < 0.7 ou sem conta sugerida ficam destacados em amarelo)
- Botão "Aplicar regra IA" que re-roda análise sobre os lançamentos do mês

Não precisa estar inteligente nesta onda — só visual e funcional sobre dados reais.

---

## Tarefa 8 · Dashboard refresh dos KPIs

Após upload + processamento, KPIs do dashboard devem refletir os novos lançamentos imediatamente.

- Documentos aguardando processamento: count where status = 'pendente' OR 'processando'
- Lançamentos do mês: count e soma where competencia = mês atual
- Atenção urgente: count where status = 'erro' OR (status = 'pendente' AND created_at < now() - 2 days)

Usar `useQuery` com `refetchInterval: 5000` ou subscription Supabase Realtime no canal `documentos` e `lancamentos`.

---

## Tarefa 9 · Seed dos 5 documentos exemplo · para a demo

Os 5 PDFs exemplo estão em `/Users/marianamarques/Documents/Claude/Projects/docs-demo/`:
- `01-extrato-cava-jun2026.pdf` (associar à empresa CAVA)
- `02-nfe-a2h.pdf` (associar à empresa A2H GESTÃO PATRIMONIAL LTDA)
- `03-planilha-codegee.pdf` (associar à empresa CODEGEE)
- `04-darf-nutrimap.pdf` (associar à empresa NUTRIMAP)
- `05-recibo-a1.pdf` (associar à empresa A1 CONSULTORIA EMPRESARIAL LTDA)

A Mari vai subir esses 5 PDFs para o repo numa pasta `docs-demo/` antes de você executar este prompt. Confirmar a presença antes de prosseguir:

```bash
ls -la docs-demo/
# deve mostrar os 5 PDFs
```

Subir os 5 PDFs para o bucket via Supabase Studio ou via script:

```typescript
// scripts/seed-docs-demo.ts (criar)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const docs = [
  { file: 'docs-demo/01-extrato-cava-jun2026.pdf', apelido: 'CAVA' },
  { file: 'docs-demo/02-nfe-a2h.pdf', apelido: 'A2H' },
  { file: 'docs-demo/03-planilha-codegee.pdf', apelido: 'CODEGEE' },
  { file: 'docs-demo/04-darf-nutrimap.pdf', apelido: 'NUTRIMAP' },
  { file: 'docs-demo/05-recibo-a1.pdf', apelido: 'A1' },
];

for (const d of docs) {
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .eq('nome_fantasia', d.apelido)
    .single();
  
  if (!empresa) continue;
  
  const fileBuffer = readFileSync(d.file);
  const filename = d.file.split('/').pop()!;
  const path = `${empresa.id}/2026-06/auto/${filename}`;
  
  await supabase.storage.from('documentos-clientes').upload(path, fileBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  
  const { data: docInserted } = await supabase
    .from('documentos')
    .insert({
      empresa_id: empresa.id,
      storage_path: path,
      mime_type: 'application/pdf',
      tamanho_bytes: fileBuffer.byteLength,
      status_processamento: 'pendente',
      nome_arquivo: filename,
    })
    .select()
    .single();
  
  // Disparar processamento
  await supabase.functions.invoke('processar-documento', {
    body: { documento_id: docInserted.id },
  });
  
  console.log(`Documento ${filename} subido e processado para ${d.apelido}`);
}
```

**NÃO RODE este seed automaticamente.** Deixe o script pronto. A Mari vai rodar manualmente no momento da demo, para mostrar ao vivo o processamento (mais convincente).

Alternativa: rode uma vez antes da reunião pra ter o "estado pós-upload" pronto como fallback caso o ao vivo dê problema.

---

## Tarefa 10 · Smoke test técnico

```bash
bun install
bun run build
bun run dev
```

Testar fluxo completo:
1. Login
2. Ir para um cliente (ex.: CAVA)
3. Aba Documentos → botão "Upload"
4. Selecionar `docs-demo/01-extrato-cava-jun2026.pdf`
5. Aguardar processamento (~30s)
6. Ver lançamentos gerados na aba Lançamentos
7. Ir para Conciliação → confirmar que apresenta os novos lançamentos
8. Gerar planilha SCI → conferir que números batem

---

## Tarefa 11 · Commits

```bash
git checkout -b claude/tobe-executavel-23jun

git add supabase/migrations/*_storage_documentos_clientes.sql
git commit -m "feat(storage): bucket documentos-clientes + RLS"

git add supabase/migrations/*_documentos_columns.sql
git commit -m "feat(documentos): colunas para storage real e status de processamento"

git add supabase/functions/processar-documento/
git commit -m "feat(ia): edge function processar-documento com Claude Sonnet 4.6"

git add src/routes/clients/$id/documentos.tsx src/components/DocumentUpload.tsx
git commit -m "feat(upload): tela de upload real com disparo de processamento"

git add src/routes/documents/$id/revisar.tsx
git commit -m "feat(revisao): tela de revisão de classificação"

git add supabase/migrations/*_agregar_lancamentos_sci.sql src/...gerar-planilha-sci...
git commit -m "fix(sci): planilha SCI agrega lançamentos reais (fecha gap)"

git add src/routes/clients/$id/conciliacao.tsx
git commit -m "feat(conciliacao): tela sobre dados reais com sinalizações IA"

git add src/routes/dashboard/...
git commit -m "feat(dashboard): KPIs com refresh em tempo real"

git add scripts/seed-docs-demo.ts docs-demo/
git commit -m "feat(demo): seed dos 5 documentos exemplo para validação 23/06"

git push origin claude/tobe-executavel-23jun
gh pr create --base main --title "feat: TO-BE executável para validação 23/06" --body "Pipeline ponta a ponta: upload → IA → lançamentos → conciliação → planilha SCI"
```

---

## Critérios de aceite finais

- [ ] Bucket `documentos-clientes` criado com RLS
- [ ] Tabela `documentos` com novas colunas
- [ ] Edge function `processar-documento` deployada e respondendo
- [ ] Tela de upload funcional · upload manual gera registro + dispara processamento
- [ ] Tela de revisão de classificação navegável
- [ ] Função SQL `agregar_lancamentos_sci` criada
- [ ] Geração da planilha SCI usa agregação real (gap fechado)
- [ ] Tela de conciliação mostra lançamentos reais com sinalizações
- [ ] Dashboard KPIs com refresh em tempo real
- [ ] Script `seed-docs-demo.ts` pronto, não executado
- [ ] Build local passa
- [ ] PR criada apontando para `main`

---

## Reportar de volta

1. Status do checklist acima
2. Qualquer ajuste de schema/nome de coluna que foi feito
3. Tempo total de execução
4. Link da PR
5. Tempo médio de processamento por documento via Claude (espero entre 10-25s por PDF)

Se travar em qualquer ponto, sinaliza imediatamente. A reunião é amanhã 23/06, o pipeline precisa estar funcional.
