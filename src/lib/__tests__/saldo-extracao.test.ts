import { describe, expect, it } from "vitest";
import { extrairSaldosDeTexto, extrairSaldosDocumento, parseValorBr } from "../saldo-extracao";

describe("saldo-extracao", () => {
  it("parseValorBr entende formato BR", () => {
    expect(parseValorBr("23.577,98")).toBe(23577.98);
    expect(parseValorBr("0,16")).toBe(0.16);
  });

  it("extrai saldos da prosa da IA (OPT-0005)", () => {
    const r = extrairSaldosDeTexto(
      "Saldo inicial: R$ 0,16. Saldo final: R$ 0,47. Total entradas: R$ 23.577,98.",
    );
    expect(r.inicial).toBe(0.16);
    expect(r.final).toBe(0.47);
  });

  it("usa chaves estruturadas quando existem", () => {
    const r = extrairSaldosDocumento({ saldo_inicial: 10, saldo_final: 20 });
    expect(r).toEqual({ inicial: 10, final: 20 });
  });

  it("faz fallback na prosa aninhada em dados_extraidos", () => {
    const r = extrairSaldosDocumento({
      dados_extraidos: "Extrato. Saldo inicial: R$ 1.234,56. Saldo final: R$ 900,00.",
    });
    expect(r.inicial).toBe(1234.56);
    expect(r.final).toBe(900);
  });
});
