// Helpers para logs_uso — rastreamento de comportamento (não de mudanças
// de dado; para isso, ver audit_log). Backing da tela /gestao/logs.
import { supabase } from "@/integrations/supabase/client";

export type TrackAcao =
  | "login"
  | "logout"
  | "viu_cliente"
  | "aprovou_lancamento"
  | "gerou_sci"
  | "perguntou_cerebro"
  | "reportou_oportunidade"
  | "abriu_conciliacao"
  | "importou_documento"
  | (string & {});

/**
 * Registra um evento de uso. Nunca lança — falhas são silenciosas para
 * não bloquear o fluxo do usuário. `user_id` vem da sessão atual.
 */
export async function trackAction(
  acao: TrackAcao,
  opts: { clienteId?: string | null; tela?: string; detalhes?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;
    await supabase.from("logs_uso").insert({
      user_id: userId,
      cliente_id: opts.clienteId ?? null,
      acao,
      tela: opts.tela ?? (typeof window !== "undefined" ? window.location.pathname : null),
      detalhes: (opts.detalhes ?? {}) as unknown as Record<string, string | number | boolean | null>,
    });
  } catch {
    // silencioso
  }
}

// ---------- consultas para a tela /gestao/logs ------------------------------

export type LogRow = {
  id: string;
  user_id: string | null;
  cliente_id: string | null;
  acao: string;
  tela: string | null;
  detalhes: Record<string, unknown>;
  criado_em: string;
};

export async function listarLogsRecentes(params: {
  desde?: string; // ISO
  ate?: string;   // ISO
  userId?: string;
  limit?: number;
} = {}): Promise<LogRow[]> {
  let q = supabase.from("logs_uso").select("*").order("criado_em", { ascending: false }).limit(params.limit ?? 500);
  if (params.desde) q = q.gte("criado_em", params.desde);
  if (params.ate) q = q.lte("criado_em", params.ate);
  if (params.userId) q = q.eq("user_id", params.userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LogRow[];
}

export type MatrizProdutividadeRow = {
  user_id: string;
  nome: string | null;
  clientes_atendidos: number;
  lancamentos_aprovados: number;
  scis_gerados: number;
  cerebro_perguntas: number;
  oportunidades_reportadas: number;
};

/**
 * Matriz de produtividade dos últimos N dias, por colaborador.
 * Cliente-side aggregation — volume esperado baixo (equipe pequena).
 */
export async function matrizProdutividade(diasAtras = 30): Promise<MatrizProdutividadeRow[]> {
  const desde = new Date(Date.now() - diasAtras * 24 * 3600 * 1000).toISOString();
  const [{ data: logs, error: e1 }, { data: perfis, error: e2 }] = await Promise.all([
    supabase.from("logs_uso").select("user_id, cliente_id, acao").gte("criado_em", desde),
    supabase.from("usuarios_perfil").select("user_id, nome"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const nomes = new Map((perfis ?? []).map((p) => [p.user_id, p.nome]));
  const acc = new Map<string, MatrizProdutividadeRow>();
  const getRow = (uid: string) => {
    let row = acc.get(uid);
    if (!row) {
      row = {
        user_id: uid,
        nome: nomes.get(uid) ?? null,
        clientes_atendidos: 0,
        lancamentos_aprovados: 0,
        scis_gerados: 0,
        cerebro_perguntas: 0,
        oportunidades_reportadas: 0,
      };
      acc.set(uid, row);
    }
    return row;
  };

  const clientePorUser = new Map<string, Set<string>>();
  for (const log of logs ?? []) {
    if (!log.user_id) continue;
    const row = getRow(log.user_id);
    if (log.cliente_id) {
      const s = clientePorUser.get(log.user_id) ?? new Set();
      s.add(log.cliente_id);
      clientePorUser.set(log.user_id, s);
    }
    switch (log.acao) {
      case "aprovou_lancamento": row.lancamentos_aprovados++; break;
      case "gerou_sci": row.scis_gerados++; break;
      case "perguntou_cerebro": row.cerebro_perguntas++; break;
      case "reportou_oportunidade": row.oportunidades_reportadas++; break;
    }
  }
  for (const [uid, s] of clientePorUser) getRow(uid).clientes_atendidos = s.size;

  return [...acc.values()].sort((a, b) => (b.cerebro_perguntas + b.lancamentos_aprovados) - (a.cerebro_perguntas + a.lancamentos_aprovados));
}
