// Travas de Analisar/Conciliar (#133 — docs/conciliacao-v3-spec.md "Três travas").
// Funções puras usadas pelo backend (index.ts) para espelhar exatamente a
// mesma regra do front (conciliacao_.$empresaId.tsx: podeAnalisar/podeFinalizar).
//
// Trava 1 — revisão: todo lançamento precisa de conta + confiança >= 80%.
// Trava 2 — faltantes: extrato sem classificação OU classificado sem extrato.
// Saldo (inicial + movimentação ≈ final) é AVISO — NÃO trava Conciliar/SCI
// (decisão Bruno 22/07/2026 · OPT-0005: ajuste fino fica na planilha ou no SCI).
// "Sem documento suporte" / docs órfãos NÃO entram aqui — não travam (spec).

export const CONF_MIN_REVISAO = 0.8;

export type LancRevisao = { confidence: number | null; contaId: string | null };

/** Espelha `precisaRevisao` do front (conciliacao_.$empresaId.tsx). */
export function precisaRevisaoLancamento(l: LancRevisao): boolean {
  return (l.confidence != null && l.confidence < CONF_MIN_REVISAO) || !l.contaId;
}

export function contarRevisaoPendente(lancs: LancRevisao[]): number {
  return lancs.filter(precisaRevisaoLancamento).length;
}

export type TravaResultado = { ok: true } | { ok: false; motivo: string };

/** Trava do botão "Analisar divergências": revisão zerada + extrato presente. */
export function avaliarTravaAnalisar(input: { temExtrato: boolean; revisaoPendente: number }): TravaResultado {
  if (!input.temExtrato) return { ok: false, motivo: "Importe o extrato bancário (CSV) antes de conciliar." };
  if (input.revisaoPendente > 0) {
    return { ok: false, motivo: `Existem ${input.revisaoPendente} lançamento(s) pendentes de revisão. Revise antes de analisar.` };
  }
  return { ok: true };
}

/** Trava do botão "Conciliar": revisão zerada + faltantes = 0 + análise feita.
 *  `saldoConfere` / `saldoMotivo` são aceitos por compatibilidade mas NÃO
 *  bloqueiam (OPT-0005 — saldo vira aviso na UI). */
export function avaliarTravaFinalizar(input: {
  analisado: boolean;
  revisaoPendente: number;
  saldoConfere?: boolean | null | undefined;
  saldoMotivo?: string | null;
  faltantesCount: number;
}): TravaResultado {
  if (input.revisaoPendente > 0) {
    return { ok: false, motivo: `Existem ${input.revisaoPendente} lançamento(s) pendentes de revisão.` };
  }
  if (!input.analisado) return { ok: false, motivo: "Analise as divergências antes de conciliar." };
  if (input.faltantesCount > 0) {
    return { ok: false, motivo: `Existem ${input.faltantesCount} transação(ões) faltante(s) (extrato sem classificação ou lançamento sem extrato). Resolva antes de conciliar.` };
  }
  return { ok: true };
}
