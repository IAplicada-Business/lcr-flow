// Parse defensivo da resposta JSON da Claude (sem structured output / json_schema).
// Haiku 4.5 estoura o compilador de gramática com schemas aninhados + array ilimitado.

export type LancSugerido = {
  data_lancamento: string;
  valor: number;
  tipo_movimento?: string;
  conta_codigo: string;
  historico_codigo?: string;
  descricao: string;
  confidence?: number;
  regra_id?: string;
  justificativa?: string;
  participante?: string;
};

export type ClassificacaoParsed = {
  tipo_documento: string;
  cliente_identificado?: string;
  competencia?: string;
  confidence_geral?: number;
  dados_extraidos?: string;
  agencia?: string;
  conta?: string;
  conta_corrente?: string;
  observacoes?: string;
  dados_suporte?: {
    valor_total?: number;
    data_documento?: string;
    participante?: string;
    numero?: string;
  };
  lancamentos_sugeridos: LancSugerido[];
};

/** Instrução de formato enviada no prompt (substitui output_config/json_schema). */
export const FORMATO_RESPOSTA_JSON = `FORMATO DE RESPOSTA — responda APENAS com um objeto JSON válido (sem markdown, sem \`\`\`, sem texto antes ou depois):
{
  "tipo_documento": "<tipo identificado>",
  "competencia": "AAAA-MM",
  "confidence_geral": 0.0,
  "dados_extraidos": "<resumo ou JSON string>",
  "agencia": "<só extrato>",
  "conta": "<só extrato, com DV ex.: 33033-2>",
  "dados_suporte": { "valor_total": 0, "data_documento": "AAAA-MM-DD", "participante": "", "numero": "" },
  "lancamentos_sugeridos": [
    {
      "data_lancamento": "AAAA-MM-DD",
      "valor": 0,
      "tipo_movimento": "debito|credito",
      "conta_codigo": "<código numérico>",
      "historico_codigo": "<código>",
      "descricao": "<texto>",
      "confidence": 0.0,
      "regra_id": "FP-01",
      "justificativa": "<1 frase>",
      "participante": ""
    }
  ],
  "observacoes": ""
}
Campos obrigatórios: tipo_documento, lancamentos_sugeridos (use [] se documento suporte).
COMPACTO: extratos/faturas com muitas linhas — liste TODOS os lançamentos; justificativa máx. 60 caracteres; omita participante se vazio.`;

/** Remove fences markdown e extrai o primeiro objeto/array JSON do texto. */
export function extrairJsonBruto(texto: string): string {
  let t = (texto ?? "").trim();
  if (!t) return "{}";
  // ```json ... ``` ou ``` ... ```
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (fence) t = fence[1].trim();
  // JSON embutido em texto explicativo
  const objStart = t.indexOf("{");
  const arrStart = t.indexOf("[");
  let start = -1;
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) start = objStart;
  else if (arrStart >= 0) start = arrStart;
  if (start > 0) t = t.slice(start);
  // Corta sufixo após o último } ou ]
  const lastObj = t.lastIndexOf("}");
  const lastArr = t.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end >= 0 && end < t.length - 1) t = t.slice(0, end + 1);
  return t.trim() || "{}";
}

function normLancamento(raw: Record<string, unknown>): LancSugerido | null {
  const data = String(raw.data_lancamento ?? "").slice(0, 10);
  const valor = Math.abs(Number(raw.valor) || 0);
  const conta = String(raw.conta_codigo ?? "").trim();
  const descricao = String(raw.descricao ?? "").slice(0, 200);
  if (!data && !conta && !descricao && !valor) return null;
  return {
    data_lancamento: data,
    valor,
    tipo_movimento: raw.tipo_movimento != null ? String(raw.tipo_movimento) : undefined,
    conta_codigo: conta || "0",
    historico_codigo: raw.historico_codigo != null ? String(raw.historico_codigo) : undefined,
    descricao: descricao || "(sem descrição)",
    confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
    regra_id: raw.regra_id != null ? String(raw.regra_id) : undefined,
    justificativa: raw.justificativa != null ? String(raw.justificativa).slice(0, 300) : undefined,
    participante: raw.participante != null ? String(raw.participante).slice(0, 120) : undefined,
  };
}

/** Normaliza objeto bruto p/ shape esperado pelo pipeline (tolerante a campos faltantes). */
export function normalizarClassificacao(raw: unknown): ClassificacaoParsed {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lancsRaw = Array.isArray(o.lancamentos_sugeridos) ? o.lancamentos_sugeridos : [];
  const lancamentos_sugeridos = lancsRaw
    .map((l) => normLancamento((l && typeof l === "object" ? l : {}) as Record<string, unknown>))
    .filter((l): l is LancSugerido => l !== null);

  let dados_suporte: ClassificacaoParsed["dados_suporte"];
  if (o.dados_suporte && typeof o.dados_suporte === "object") {
    const ds = o.dados_suporte as Record<string, unknown>;
    dados_suporte = {
      valor_total: typeof ds.valor_total === "number" ? ds.valor_total : undefined,
      data_documento: ds.data_documento != null ? String(ds.data_documento) : undefined,
      participante: ds.participante != null ? String(ds.participante) : undefined,
      numero: ds.numero != null ? String(ds.numero) : undefined,
    };
  }

  return {
    tipo_documento: String(o.tipo_documento ?? "outro"),
    cliente_identificado: o.cliente_identificado != null ? String(o.cliente_identificado) : undefined,
    competencia: o.competencia != null ? String(o.competencia) : undefined,
    confidence_geral: typeof o.confidence_geral === "number" ? o.confidence_geral : undefined,
    // #fix-dados-extraidos-object: a IA normalmente retorna dados_extraidos como
    // objeto JSON (não string) — String(obj) virava literalmente "[object Object]",
    // que o index.ts (auto-sync de contas_bancarias) tentava JSON.parse e falhava
    // silenciosamente, caindo no fallback {} (banco/agência/conta nunca sincronizavam).
    dados_extraidos: o.dados_extraidos != null
      ? (typeof o.dados_extraidos === "string" ? o.dados_extraidos : JSON.stringify(o.dados_extraidos))
      : undefined,
    agencia: o.agencia != null ? String(o.agencia) : undefined,
    conta: o.conta != null ? String(o.conta) : (o.conta_corrente != null ? String(o.conta_corrente) : undefined),
    conta_corrente: o.conta_corrente != null ? String(o.conta_corrente) : undefined,
    observacoes: o.observacoes != null ? String(o.observacoes) : undefined,
    dados_suporte,
    lancamentos_sugeridos,
  };
}

/** Extrai objetos JSON completos de um array truncado (ex.: lancamentos_sugeridos). */
export function extrairObjetosCompletosArray(json: string, key: string): Record<string, unknown>[] {
  const keyPat = `"${key}"`;
  const idx = json.indexOf(keyPat);
  if (idx < 0) return [];
  const arrStart = json.indexOf("[", idx);
  if (arrStart < 0) return [];

  const objects: Record<string, unknown>[] = [];
  let i = arrStart + 1;
  while (i < json.length) {
    while (i < json.length && /[\s,]/.test(json[i])) i++;
    if (i >= json.length || json[i] === "]") break;
    if (json[i] !== "{") break;

    let depth = 0;
    const start = i;
    let inString = false;
    let escape = false;
    for (; i < json.length; i++) {
      const c = json[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\" && inString) {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try {
            objects.push(JSON.parse(json.slice(start, i + 1)) as Record<string, unknown>);
          } catch {
            return objects;
          }
          i++;
          break;
        }
      }
    }
    if (depth !== 0) break;
  }
  return objects;
}

function extrairCampoString(json: string, key: string): string | undefined {
  const m = json.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
  return m?.[1];
}

/** Tenta fechar JSON cortado no meio (sufixos comuns) antes de extrair array parcial. */
export function repararJsonTruncado(bruto: string): string | null {
  const t = bruto.trim();
  if (!t) return null;
  const sufixos = ["]}", "}", '"]}', '"}]', "null]}", '""]}'];
  for (const suf of sufixos) {
    try {
      JSON.parse(t + suf);
      return t + suf;
    } catch {
      /* próximo */
    }
  }
  return null;
}

export type ParseClassificacaoOpts = { allowTruncated?: boolean };

export function parseClassificacaoResposta(texto: string, opts?: ParseClassificacaoOpts): ClassificacaoParsed {
  const bruto = extrairJsonBruto(texto);
  try {
    return normalizarClassificacao(JSON.parse(bruto));
  } catch (firstErr) {
    if (!opts?.allowTruncated) throw firstErr;

    const reparado = repararJsonTruncado(bruto);
    if (reparado) {
      try {
        return normalizarClassificacao(JSON.parse(reparado));
      } catch {
        /* fallback parcial */
      }
    }

    const parcial = extrairObjetosCompletosArray(bruto, "lancamentos_sugeridos");
    if (parcial.length === 0) throw firstErr;

    const obs = extrairCampoString(bruto, "observacoes");
    return normalizarClassificacao({
      tipo_documento: extrairCampoString(bruto, "tipo_documento") ?? "outro",
      competencia: extrairCampoString(bruto, "competencia"),
      agencia: extrairCampoString(bruto, "agencia"),
      conta: extrairCampoString(bruto, "conta"),
      dados_extraidos: extrairCampoString(bruto, "dados_extraidos"),
      lancamentos_sugeridos: parcial,
      observacoes: obs
        ? `${obs} | JSON truncado — ${parcial.length} lançamento(s) recuperados`
        : `JSON truncado — ${parcial.length} lançamento(s) recuperados`,
    });
  }
}
