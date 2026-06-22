// Edge Function: cerebro-mestre · persona Mestre (Base de Conhecimento)
// Público: time interno LCR. Fontes: kb_processos, kb_articles, kb_videos.
// Onda 1: busca textual simples (ILIKE). Onda 2: busca semântica (embeddings).
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
const PERSONA = "mestre";

const SYSTEM_PROMPT = `Você é o Mestre, a inteligência da Base de Conhecimento da LCR Contadores.
Seu papel é ajudar o time interno (analistas contábeis, fiscais, DP, RH) a:
- Encontrar o processo certo para a tarefa em mãos
- Entender o padrão da casa para uma decisão
- Onboardar colaboradores novos com método
- Consultar histórico de decisões da empresa
Você responde com base em processos documentados, artigos da base de conhecimento e vídeos. Quando referenciar algo, cite o código do processo (ex.: PROC-001) ou link para o artigo.
Tom: didático, direto, profissional. Use termos contábeis brasileiros corretamente (ex.: "movimento mensal", "balancete", "DCTF"). Não invente padrões — se não souber, diga "não tenho esse processo documentado ainda, vale criar um artigo".
Quando o usuário descrever uma tarefa, sugira o processo mais próximo e ofereça abrir o vídeo se houver.`;

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

  let body: { pergunta?: string };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }
  const pergunta = (body.pergunta ?? "").trim();
  if (!pergunta) return fail("Pergunta vazia.");

  // ---- contexto -----------------------------------------------------
  const termo = `%${pergunta.slice(0, 80)}%`;
  const [{ data: processos }, { data: artigos }, { data: videos }] = await Promise.all([
    admin.from("kb_processos").select("codigo, nome, area, descricao, link_execucao").eq("ativo", true).order("ordem"),
    admin.from("kb_articles").select("id, titulo, categoria, tags, conteudo_markdown")
      .eq("ativo", true).or(`titulo.ilike.${termo},conteudo_markdown.ilike.${termo}`).limit(5),
    admin.from("kb_videos").select("titulo, url, categoria").limit(5),
  ]);

  const ctxProcessos = (processos ?? []).map((p) => `${p.codigo} [${p.area}] ${p.nome} — ${p.descricao ?? ""}`).join("\n");
  const ctxArtigos = (artigos ?? []).map((a) => `• ${a.titulo} (${a.categoria ?? "-"}): ${(a.conteudo_markdown ?? "").slice(0, 300)}`).join("\n") || "(nenhum artigo correspondente)";
  const ctxVideos = (videos ?? []).map((v) => `• ${v.titulo}: ${v.url}`).join("\n");
  const fontes = {
    processos: (processos ?? []).map((p) => p.codigo),
    artigos: (artigos ?? []).map((a) => a.id),
  };

  if (!apiKey) {
    const resp = `Encontrei estes processos que podem ajudar:\n\n${ctxProcessos}\n\n(IA indisponível — configure ANTHROPIC_API_KEY para respostas completas.)`;
    await admin.from("cerebro_interactions").insert({ persona: PERSONA, usuario_id: userData.user.id, pergunta, resposta: resp, fontes_consultadas: fontes, modelo: null, duracao_ms: Date.now() - t0 });
    return json(200, { ok: true, resposta: resp, fontes });
  }

  let resposta = "", tokens = 0;
  try {
    const apiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: `PERGUNTA DO TIME:\n${pergunta}\n\nPROCESSOS DOCUMENTADOS:\n${ctxProcessos}\n\nARTIGOS RELEVANTES:\n${ctxArtigos}\n\nVÍDEOS:\n${ctxVideos}`,
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
    fontes_consultadas: fontes, tokens_usados: tokens, modelo: MODEL, duracao_ms: Date.now() - t0,
  });
  return json(200, { ok: true, resposta, fontes });
});
