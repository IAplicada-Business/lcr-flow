import { describe, expect, it } from "vitest";
import { calendarioParaCompetencia, mesAnoParaCompetencia } from "../format";

describe("competência no seletor (OPT-0004)", () => {
  it("mesAnoParaCompetencia é 1:1 — Jan/2026 → 2026-01", () => {
    expect(mesAnoParaCompetencia(2026, 1)).toBe("2026-01");
    expect(mesAnoParaCompetencia(2026, 12)).toBe("2026-12");
  });

  it("calendarioParaCompetencia (legado) ainda subtrai 1 mês", () => {
    expect(calendarioParaCompetencia(2026, 1)).toBe("2025-12");
    expect(calendarioParaCompetencia(2026, 7)).toBe("2026-06");
  });
});
