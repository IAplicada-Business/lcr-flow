// Edge Function: cerebro-buddy · persona Buddy (uso operacional do sistema)
// Papel: ajudar o time a saber COMO fazer algo na tela (não o que a conta
// significa contabilmente — isso é do Mestre / Consultor).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (error: string) => json(200, { ok: false, error });

const MODEL = "claude-sonnet-4-6";
const PERSONA = "buddy";

const SYSTEM_PROMPT = `Você é o Buddy, o parceiro operacional do time da LCR Contadores dentro do sistema.
Seu papel: ajudar quem está usando a ferramenta a saber COMO fazer algo na tela.

Você responde sobre:
- Como executar ações no sistema (aprovar lançamento, importar documento, gerar SCI, conciliar extrato)
- O que significa cada campo/coluna nas telas
- Como resolver estados de erro comuns
- Fluxo operacional dentro do sistema

Você NÃO responde:
- Dúvida contábil de conteúdo (redirecione ao Mestre: "essa é conta do Mestre, muda a persona")
- Dados específicos de cliente (redirecione: "abra o cliente e o Consultor te ajuda")
- Pergunta sobre health score / CX (redirecione ao Cuidador)

Tom: direto, prático, passo a passo. A equipe é júnior. No máximo 3 passos por resposta. Se for mais complexo,
sugira abrir o Mestre para ver o processo documentado.

Sempre que citar botão ou aba, use "" e o nome literal (ex.: aba "Documentos", botão "Aprovar").`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Método não permitido");
  const t0 = Date.now();

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json(401, { error: "Sem token" });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json(401, { error: "Token inválido" });

  let body: { pergunta?: string; tela?: string; empresa_id?: string };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }
  const pergunta = (body.pergunta ?? "").trim();
  if (!pergunta) return fail("Pergunta vazia.");
  const tela = body.tela ?? "(sem contexto de tela)";
  const empresaId = body.empresa_id ?? null;

  if (!apiKey) {
    const resp = "IA indisponível — configure ANTHROPIC_API_KEY.";
    await admin.from("cerebro_interactions").insert({
      persona: PERSONA, usuario_id: userData.user.id, pergunta, resposta: resp,
      fontes_consultadas: {}, modelo: null, duracao_ms: Date.now() - t0,
    });
    return json(200, { ok: false, resposta: resp });
  }

  let resposta = "", tokens = 0;
  try {
    const apiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: `Contexto da tela: ${tela}${empresaId ? `\nEmpresa em foco: ${empresaId}` : ""}\n\nPERGUNTA:\n${pergunta}`,
          }],
        }],
      }),
    });
    if (!apiResp.ok) return fail(`IA retornou ${apiResp.status}: ${(await apiResp.text()).slice(0, 200)}`);
    const dataApi = await apiResp.json();
    resposta = (dataApi.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim();
    tokens = (dataApi.usage?.input_tokens ?? 0) + (dataApi.usage?.output_tokens ?? 0);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Falha ao chamar a IA.");
  }

  await admin.from("cerebro_interactions").insert({
    persona: PERSONA, usuario_id: userData.user.id, pergunta, resposta,
    fontes_consultadas: { tela, empresa_id: empresaId },
    tokens_usados: tokens, modelo: MODEL, duracao_ms: Date.now() - t0,
  });
  return json(200, { ok: true, resposta });
});
