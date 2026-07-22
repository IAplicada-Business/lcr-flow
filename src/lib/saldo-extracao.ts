// Extração de saldo_inicial/saldo_final (espelha supabase/functions/conciliar/extrair-saldo.ts).
// A IA frequentemente grava o saldo só na prosa ("Saldo inicial: R$ 0,16") —
// sem o fallback de regex a UI mostra "não identificado" mesmo com o valor
// presente no extrato (OPT-0005).

export function parseValorBr(raw: string): number | null {
  const s = raw.trim().replace(/[^\d,.\-]/g, "");
  if (!s) return null;
  const normalizado = /\d+\.\d{3}/.test(s) || (s.includes(",") && s.includes("."))
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export function extrairSaldosDeTexto(texto: string): { inicial: number | null; final: number | null } {
  if (!texto) return { inicial: null, final: null };
  const reInicial = /saldo\s+inicial\s*[:\-]?\s*R\$\s*([\d.]+(?:,\d{2})?|\d+(?:[.,]\d+)?)/i;
  const reFinal = /saldo\s+final\s*[:\-]?\s*R\$\s*([\d.]+(?:,\d{2})?|\d+(?:[.,]\d+)?)/i;
  const mi = texto.match(reInicial);
  const mf = texto.match(reFinal);
  return {
    inicial: mi ? parseValorBr(mi[1]) : null,
    final: mf ? parseValorBr(mf[1]) : null,
  };
}

function pickNumero(obj: Record<string, unknown> | null | undefined, chaves: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  for (const k of chaves) {
    const v = obj[k];
    if (v == null || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseValorBr(v);
      if (n != null) return n;
    }
  }
  return null;
}

function coletarTextos(valor: unknown, out: string[], profundidade = 0): void {
  if (profundidade > 4 || valor == null) return;
  if (typeof valor === "string") {
    if (valor.length > 8) out.push(valor);
    return;
  }
  if (typeof valor !== "object") return;
  if (Array.isArray(valor)) {
    for (const item of valor) coletarTextos(item, out, profundidade + 1);
    return;
  }
  for (const v of Object.values(valor as Record<string, unknown>)) {
    coletarTextos(v, out, profundidade + 1);
  }
}

const CHAVES_INICIAL = ["saldo_inicial", "saldo_inicio", "saldo_anterior", "opening_balance", "balance_start"];
const CHAVES_FINAL = ["saldo_final", "saldo_atual", "saldo_disponivel", "closing_balance", "balance_end"];

export function extrairSaldosDocumento(
  dadosExtraidos: unknown,
  classificacaoIa?: unknown,
): { inicial: number | null; final: number | null } {
  const ci = (classificacaoIa && typeof classificacaoIa === "object")
    ? classificacaoIa as Record<string, unknown>
    : null;
  const dados = (
    (ci?.dados_extraidos && typeof ci.dados_extraidos === "object" ? ci.dados_extraidos : null)
    ?? (dadosExtraidos && typeof dadosExtraidos === "object" ? dadosExtraidos : null)
  ) as Record<string, unknown> | null;

  let inicial = pickNumero(dados, CHAVES_INICIAL);
  let final = pickNumero(dados, CHAVES_FINAL);
  if (inicial != null && final != null) return { inicial, final };

  const textos: string[] = [];
  coletarTextos(dados, textos);
  coletarTextos(classificacaoIa, textos);
  coletarTextos(dadosExtraidos, textos);
  for (const t of textos) {
    const parsed = extrairSaldosDeTexto(t);
    if (inicial == null && parsed.inicial != null) inicial = parsed.inicial;
    if (final == null && parsed.final != null) final = parsed.final;
    if (inicial != null && final != null) break;
  }
  return { inicial, final };
}
