// Upload manual de documentos — lógica compartilhada entre UploadDialog
// (documentos.tsx, tela global) e UploadDocDialog (painel.tsx, aba do cliente).
// Antes, cada tela reimplementava isso de forma divergente (só uma sanitizava
// o nome do arquivo, ambas confiavam em file.name cru pro path do Storage, e
// nenhuma limpava o arquivo do bucket se createDocumento falhasse depois do
// upload). Unificado aqui pra corrigir os dois de uma vez e não divergir de novo.
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { createDocumento, ensureCompetencia } from "@/lib/lcr.functions";

// Extensões que a Edge Function processar-documento sabe processar (ver
// TEXTUAL/IMG em supabase/functions/processar-documento/index.ts) + xls/xlsx,
// que agora convertemos para CSV aqui no client antes de subir.
const EXTENSOES_ACEITAS = ["pdf", "jpg", "jpeg", "png", "webp", "gif", "csv", "txt", "xml", "ofx", "xls", "xlsx"];
export const ACCEPT_ARQUIVO = EXTENSOES_ACEITAS.map((e) => `.${e}`).join(",");

const MIME_POR_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  csv: "text/csv",
  txt: "text/plain",
  xml: "application/xml",
  ofx: "application/x-ofx",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function extensao(nome: string): string {
  return (nome.split(".").pop() ?? "").toLowerCase();
}

// Mesma sanitização que já existia em painel.tsx (a única das duas telas que
// fazia isso) — remove acentos e qualquer caractere fora de [a-zA-Z0-9._-],
// evitando path injection via nome de arquivo (ex.: "../../foo", "a/b.pdf").
export function nomeArquivoSeguro(nome: string): string {
  const semAcento = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return semAcento.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class ArquivoInvalidoError extends Error {}

// Converte a 1ª planilha de um .xls/.xlsx para CSV (separador ";", mesma
// convenção do parser Python em bridge_front.py::processar_documento_edge —
// df.to_csv(sep=";")), já que a edge (Claude) não lê Excel binário. Mesmo
// padrão de leitura (XLSX.read com type:"array") já usado em sci-xls.ts e
// revisar.$documentoId.tsx para preview de planilhas.
async function converterXlsParaCsv(file: File): Promise<File> {
  let wb: XLSX.WorkBook;
  try {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: "array" });
  } catch (e) {
    throw new ArquivoInvalidoError(
      `Não consegui ler "${file.name}" como planilha Excel. Exporte como CSV ou envie o PDF original.`,
    );
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new ArquivoInvalidoError(`"${file.name}" não tem nenhuma planilha legível. Exporte como CSV ou envie o PDF original.`);
  }
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName], { FS: ";" });
  const nomeBase = file.name.replace(/\.(xlsx|xls)$/i, "");
  return new File([csv], `${nomeBase}.csv`, { type: "text/csv" });
}

export type UploadDocumentoInput = {
  empresaId: string;
  competencia: string;
  tipo: string;
  file: File;
};

export type UploadDocumentoResult = {
  documentoId: string;
};

// Roda no fire-and-forget de processar-documento após o registro do
// documento; devolve o resultado pro caller decidir o toast/invalidação de
// queries (cada tela tem queries diferentes pra invalidar).
export function invocarProcessamentoIa(documentoId: string) {
  return supabase.functions.invoke("processar-documento", { body: { documento_id: documentoId } });
}

// Upload manual completo: valida extensão, converte Excel -> CSV se preciso,
// sobe no Storage e registra o documento. Em caso de falha do createDocumento
// DEPOIS do upload ter sido bem-sucedido, remove o arquivo órfão do bucket.
export async function uploadDocumentoManual(input: UploadDocumentoInput): Promise<UploadDocumentoResult> {
  const { empresaId, competencia, tipo } = input;
  let file = input.file;
  const ext = extensao(file.name);

  if (!EXTENSOES_ACEITAS.includes(ext)) {
    throw new ArquivoInvalidoError(
      `Tipo de arquivo ".${ext || "?"}" não suportado. Envie PDF, imagem, CSV/TXT/XML ou planilha Excel.`,
    );
  }

  if (ext === "xls" || ext === "xlsx") {
    file = await converterXlsParaCsv(file);
  }

  const { id: competencia_id } = await ensureCompetencia({ data: { empresa_id: empresaId, competencia } });

  const safeName = nomeArquivoSeguro(file.name);
  const path = `${empresaId}/${competencia}/auto/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from("documentos-clientes")
    .upload(path, file, { upsert: false, cacheControl: "3600" });
  if (upErr) throw new Error(upErr.message);

  try {
    const doc = await createDocumento({
      data: {
        empresa_id: empresaId,
        tipo: tipo as "extrato",
        competencia,
        competencia_id,
        arquivo_url: path,
        storage_path: path,
        arquivo_nome: file.name,
        arquivo_tamanho_bytes: file.size,
        mime_type: file.type || MIME_POR_EXT[extensao(file.name)] || "application/octet-stream",
      },
    });
    return { documentoId: doc.id };
  } catch (err) {
    // createDocumento falhou depois do upload ter subido — sem isso o
    // arquivo fica órfão no bucket pra sempre (nunca aparece na UI de
    // documentos, mas continua ocupando espaço e nunca é limpo).
    await supabase.storage.from("documentos-clientes").remove([path]).catch(() => {});
    throw err;
  }
}
