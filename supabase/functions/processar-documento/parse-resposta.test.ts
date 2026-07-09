// Rodar: deno test supabase/functions/processar-documento/parse-resposta.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { extrairJsonBruto, normalizarClassificacao, parseClassificacaoResposta } from "./parse-resposta.ts";

Deno.test("extrairJsonBruto remove fences markdown", () => {
  const t = '```json\n{"tipo_documento":"recibo","lancamentos_sugeridos":[]}\n```';
  assertEquals(extrairJsonBruto(t), '{"tipo_documento":"recibo","lancamentos_sugeridos":[]}');
});

Deno.test("parseClassificacaoResposta tolera texto antes do JSON", () => {
  const t = 'Aqui está:\n{"tipo_documento":"darf","lancamentos_sugeridos":[]}';
  const r = parseClassificacaoResposta(t);
  assertEquals(r.tipo_documento, "darf");
  assertEquals(r.lancamentos_sugeridos.length, 0);
});

Deno.test("normalizarClassificacao garante lancamentos_sugeridos array", () => {
  const r = normalizarClassificacao({ tipo_documento: "outro" });
  assertEquals(r.lancamentos_sugeridos, []);
});

Deno.test("parseClassificacaoResposta recupera lancamentos de JSON truncado", () => {
  const t = `{"tipo_documento":"extrato_bancario","competencia":"2026-02","lancamentos_sugeridos":[
    {"data_lancamento":"2026-02-01","valor":100,"tipo_movimento":"debito","conta_codigo":"160","historico_codigo":"267","descricao":"PIX","confidence":0.9},
    {"data_lancamento":"2026-02-02","valor":200,"tipo_movimento":"credito","conta_codigo":"7","historico_codigo":"7","descricao":"TED","confidence":0.8},
    {"data_lancamento":"2026-02-03","valor":50,"tipo_movimento":"debito","conta_codigo":"160","historico_codigo":"267","descricao":"incompleto`;
  const r = parseClassificacaoResposta(t, { allowTruncated: true });
  assertEquals(r.tipo_documento, "extrato_bancario");
  assertEquals(r.lancamentos_sugeridos.length, 2);
  assertEquals(r.lancamentos_sugeridos[0].valor, 100);
});
