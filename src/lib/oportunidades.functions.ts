// Queries/mutations do Banco de Oportunidades — /gestao/oportunidades.
import { supabase } from "@/integrations/supabase/client";

export type OportTipo = "bug" | "melhoria" | "duvida";
export type OportStatus = "aberto" | "em_analise" | "planejado" | "em_dev" | "entregue" | "descartado";
export type OportImpacto = "bloqueia" | "atrapalha" | "cosmetico";
export type OportPrioridade = "critica" | "alta" | "media" | "baixa";

export type Oportunidade = {
  id: string;
  numero: string;
  tipo: OportTipo;
  titulo: string;
  descricao: string;
  tela_origem: string | null;
  cliente_id: string | null;
  autor_id: string | null;
  impacto: OportImpacto | null;
  frequencia_uso: string | null;
  problema_resolve: string | null;
  prioridade: OportPrioridade;
  status: OportStatus;
  cerebro_conversa_id: string | null;
  criado_em: string;
  atualizado_em: string;
  votos?: number;
  votei?: boolean;
};

export type OportunidadeComentario = {
  id: string;
  oportunidade_id: string;
  autor_id: string | null;
  tipo: "interno" | "publico";
  conteudo: string;
  criado_em: string;
};

export type OportunidadeHistorico = {
  id: string;
  oportunidade_id: string;
  status_anterior: string | null;
  status_novo: string;
  mudado_por: string | null;
  mudado_em: string;
  comentario: string | null;
};

export async function listarOportunidades(): Promise<Oportunidade[]> {
  const [{ data: opts, error: e1 }, { data: votos, error: e2 }, { data: sess }] = await Promise.all([
    supabase.from("oportunidades").select("*").order("criado_em", { ascending: false }),
    supabase.from("oportunidade_votos").select("oportunidade_id, user_id"),
    supabase.auth.getSession(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const meuId = sess.session?.user?.id ?? null;
  const contagem = new Map<string, number>();
  const meusVotos = new Set<string>();
  for (const v of votos ?? []) {
    contagem.set(v.oportunidade_id, (contagem.get(v.oportunidade_id) ?? 0) + 1);
    if (v.user_id === meuId) meusVotos.add(v.oportunidade_id);
  }
  return (opts ?? []).map((o) => ({
    ...(o as Oportunidade),
    votos: contagem.get(o.id) ?? 0,
    votei: meusVotos.has(o.id),
  }));
}

export async function criarOportunidade(input: {
  tipo: OportTipo;
  titulo: string;
  descricao: string;
  tela_origem?: string | null;
  cliente_id?: string | null;
  impacto?: OportImpacto | null;
  frequencia_uso?: string | null;
  problema_resolve?: string | null;
  prioridade?: OportPrioridade;
  cerebro_conversa_id?: string | null;
}): Promise<Oportunidade> {
  const { data: sess } = await supabase.auth.getSession();
  const autorId = sess.session?.user?.id;
  if (!autorId) throw new Error("Sem sessão.");
  const { data, error } = await supabase
    .from("oportunidades")
    .insert({
      autor_id: autorId,
      numero: "",  // trigger preenche
      tipo: input.tipo,
      titulo: input.titulo,
      descricao: input.descricao,
      tela_origem: input.tela_origem ?? null,
      cliente_id: input.cliente_id ?? null,
      impacto: input.impacto ?? null,
      frequencia_uso: input.frequencia_uso ?? null,
      problema_resolve: input.problema_resolve ?? null,
      prioridade: input.prioridade ?? "media",
      cerebro_conversa_id: input.cerebro_conversa_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Oportunidade;
}

export async function mudarStatusOportunidade(id: string, novo: OportStatus): Promise<void> {
  const { data, error } = await supabase
    .from("oportunidades")
    .update({ status: novo })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Não foi possível atualizar o status (sem permissão ou registro inexistente).");
}

export async function votarOportunidade(id: string, votar: boolean): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) throw new Error("Sem sessão.");
  if (votar) {
    // insert puro: evita upsert (que exige UPDATE). Re-voto do mesmo user é no-op via PK.
    const { error } = await supabase.from("oportunidade_votos")
      .insert({ oportunidade_id: id, user_id: userId });
    if (error) {
      // 23505 = unique_violation — já votou; trata como sucesso.
      if ((error as { code?: string }).code === "23505") return;
      throw error;
    }
  } else {
    const { error } = await supabase.from("oportunidade_votos")
      .delete().eq("oportunidade_id", id).eq("user_id", userId);
    if (error) throw error;
  }
}

export async function comentariosOportunidade(id: string): Promise<OportunidadeComentario[]> {
  const { data, error } = await supabase
    .from("oportunidade_comentarios")
    .select("*")
    .eq("oportunidade_id", id)
    .order("criado_em");
  if (error) throw error;
  return (data ?? []) as OportunidadeComentario[];
}

export async function comentarOportunidade(id: string, conteudo: string, tipo: "interno" | "publico" = "interno"): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const autorId = sess.session?.user?.id;
  if (!autorId) throw new Error("Sem sessão.");
  const { error } = await supabase.from("oportunidade_comentarios").insert({
    oportunidade_id: id, autor_id: autorId, tipo, conteudo,
  });
  if (error) throw error;
}

export async function historicoOportunidade(id: string): Promise<OportunidadeHistorico[]> {
  const { data, error } = await supabase
    .from("oportunidade_historico")
    .select("*")
    .eq("oportunidade_id", id)
    .order("mudado_em");
  if (error) throw error;
  return (data ?? []) as OportunidadeHistorico[];
}

/**
 * Busca oportunidades com títulos semelhantes (para anti-duplicata na
 * persona Reportar). Fuzzy simples via ILIKE por palavras > 4 chars.
 */
export async function buscarSimilares(titulo: string): Promise<Oportunidade[]> {
  const termos = titulo.toLowerCase().split(/\W+/).filter((t) => t.length > 4);
  if (!termos.length) return [];
  const filtro = termos.map((t) => `titulo.ilike.%${t}%`).join(",");
  const { data, error } = await supabase
    .from("oportunidades")
    .select("*")
    .or(filtro)
    .neq("status", "descartado")
    .neq("status", "entregue")
    .limit(5);
  if (error) throw error;
  return (data ?? []) as Oportunidade[];
}

export const STATUS_ORDEM: OportStatus[] = ["aberto", "em_analise", "planejado", "em_dev", "entregue", "descartado"];
export const STATUS_LABEL: Record<OportStatus, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  planejado: "Planejado",
  em_dev: "Em desenvolvimento",
  entregue: "Entregue",
  descartado: "Descartado",
};
export const TIPO_LABEL: Record<OportTipo, string> = {
  bug: "Bug",
  melhoria: "Melhoria",
  duvida: "Dúvida",
};
