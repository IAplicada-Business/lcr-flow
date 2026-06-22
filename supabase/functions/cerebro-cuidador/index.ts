// Edge Function: cerebro-cuidador · persona Cuidador (CX · Experiência)
// Público: líder de relacionamento / CS interno.
// Fontes: cx_touchpoints, cx_nps_responses, cx_health_score, cx_engagement_events.
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
const PERSONA = "cuidador";

const SYSTEM_PROMPT = `Você é o Cuidador, a inteligência de relacionamento do Cérebro LCR.
Seu papel é zelar pela qualidade da experiência dos clientes da LCR. Você é olho clínico sobre a jornada do cliente — sente quando o relacionamento esfria antes que vire churn.
Para cada cliente, você acompanha:
- Frequência de contato (touchpoints recentes vs histórico)
- NPS atual e tendência
- Sinais de engajamento (envio em dia de documentos, retorno rápido, etc.)
- Eventos críticos (reclamações, atrasos, mudanças bruscas de comportamento)
Quando o usuário perguntar sobre um cliente, você:
- Olha o health score atual e o que mudou desde o último cálculo
- Identifica o que sustenta ou ameaça o relacionamento
- Sugere uma ação concreta de relacionamento (não genérica)
Quando o usuário perguntar sobre a carteira inteira, você:
- Lista os 3 a 5 clientes que precisam de atenção esta semana
- Diferencia atenção positiva (oportunidade de aprofundar) de atenção corretiva (risco de churn)
Tom: empático, atento, sem ser piegas. Português brasileiro de líder de equipe. Foco em ação, não em diagnóstico genérico.`;

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

  let body: { pergunta?: string; empresa_id?: string };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }
  const pergunta = (body.pergunta ?? "Quais clientes precisam de atenção esta semana?").trim();
  const empresaId = body.empresa_id;

  let ctx = "";
  const fontes: Record<string, unknown> = {};
  if (empresaId) {
    const [{ data: empresa }, { data: hs }, { data: tps }, { data: nps }, { data: ev }] = await Promise.all([
      admin.from("empresas").select("razao_social, nome_fantasia").eq("id", empresaId).maybeSingle(),
      admin.from("cx_health_score").select("*").eq("empresa_id", empresaId).maybeSingle(),
      admin.from("cx_touchpoints").select("tipo, canal, descricao, created_at").eq("empresa_id", empresaId).order("created_at", { ascending: false }).limit(8),
      admin.from("cx_nps_responses").select("score, periodo, categoria").eq("empresa_id", empresaId).order("periodo", { ascending: false }).limit(6),
      admin.from("cx_engagement_events").select("evento, peso, created_at").eq("empresa_id", empresaId).order("created_at", { ascending: false }).limit(8),
    ]);
    const nome = empresa?.nome_fantasia ?? empresa?.razao_social ?? "cliente";
    ctx = [
      `CLIENTE: ${nome}`,
      hs ? `HEALTH SCORE: ${hs.score}/100 (${hs.classificacao}, tendência ${hs.tendencia}). Fatores: ${JSON.stringify(hs.fatores)}` : "Sem health score calculado.",
      `NPS recentes: ` + ((nps ?? []).map((r) => `${r.periodo}: ${r.score} (${r.categoria})`).join(" | ") || "(nenhum)"),
      `TOUCHPOINTS recentes:\n` + ((tps ?? []).map((t) => `- ${new Date(t.created_at).toLocaleDateString("pt-BR")} ${t.tipo}/${t.canal}: ${t.descricao ?? ""}`).join("\n") || "(nenhum)"),
      `EVENTOS de engajamento:\n` + ((ev ?? []).map((e) => `- ${e.evento} (peso ${e.peso})`).join("\n") || "(nenhum)"),
    ].join("\n");
    fontes.empresa_id = empresaId;
  } else {
    const { data: carteira } = await admin.from("cx_health_score")
      .select("empresa_id, score, classificacao, tendencia, empresas(razao_social, nome_fantasia)")
      .order("score", { ascending: true }).limit(15);
    ctx = `CARTEIRA (menores health scores primeiro):\n` + (carteira ?? []).map((h) => {
      const e = h.empresas as { razao_social?: string; nome_fantasia?: string } | null;
      return `- ${e?.nome_fantasia ?? e?.razao_social ?? h.empresa_id}: ${h.score}/100 (${h.classificacao}, ${h.tendencia})`;
    }).join("\n");
    fontes.carteira = (carteira ?? []).map((h) => h.empresa_id);
  }

  if (!apiKey) {
    const resp = `Panorama de relacionamento (IA indisponível — configure ANTHROPIC_API_KEY):\n\n${ctx}`;
    await admin.from("cerebro_interactions").insert({ persona: PERSONA, usuario_id: userData.user.id, empresa_id: empresaId ?? null, pergunta, resposta: resp, fontes_consultadas: fontes, duracao_ms: Date.now() - t0 });
    return json(200, { ok: true, resposta: resp, fontes });
  }

  let resposta = "", tokens = 0;
  try {
    const apiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1300, system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: `PERGUNTA:\n${pergunta}\n\nDADOS DE RELACIONAMENTO:\n${ctx}` }] }],
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
    persona: PERSONA, usuario_id: userData.user.id, empresa_id: empresaId ?? null, pergunta, resposta,
    fontes_consultadas: fontes, tokens_usados: tokens, modelo: MODEL, duracao_ms: Date.now() - t0,
  });
  return json(200, { ok: true, resposta, fontes });
});
