import { describe, expect, it } from "vitest";
import { paginarTodas } from "./paginar";

describe("paginarTodas", () => {
  it("resultado vazio (0 páginas)", async () => {
    const data = await paginarTodas<number>(async () => ({ data: [], error: null }));
    expect(data).toEqual([]);
  });

  it("uma única página menor que pageSize não busca a próxima", async () => {
    let chamadas = 0;
    const data = await paginarTodas<number>(async () => {
      chamadas++;
      return { data: [1, 2], error: null };
    }, 5);
    expect(data).toEqual([1, 2]);
    expect(chamadas).toBe(1);
  });

  it("várias páginas cheias seguidas de uma parcial acumula tudo", async () => {
    const paginas = [[1, 2, 3], [4, 5, 6], [7]];
    let i = 0;
    const data = await paginarTodas<number>(async () => ({ data: paginas[i++] ?? [], error: null }), 3);
    expect(data).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(i).toBe(3);
  });

  it("última página com exatamente pageSize itens ainda busca a próxima (vazia) antes de parar", async () => {
    const paginas = [[1, 2, 3], []];
    let i = 0;
    const data = await paginarTodas<number>(async () => ({ data: paginas[i++] ?? [], error: null }), 3);
    expect(data).toEqual([1, 2, 3]);
    expect(i).toBe(2);
  });

  it("erro numa página interrompe o loop e lança exceção", async () => {
    let chamadas = 0;
    await expect(
      paginarTodas<number>(async () => {
        chamadas++;
        if (chamadas === 2) return { data: null, error: { message: "boom" } };
        return { data: [1, 2, 3], error: null };
      }, 3),
    ).rejects.toThrow("boom");
    expect(chamadas).toBe(2);
  });

  it("data null numa página é tratado como fim (sem erro)", async () => {
    const data = await paginarTodas<number>(async () => ({ data: null, error: null }), 3);
    expect(data).toEqual([]);
  });

  it("offset/pageSize avançam corretamente entre chamadas", async () => {
    const offsets: number[] = [];
    await paginarTodas<number>(async (offset, pageSize) => {
      offsets.push(offset);
      const pagina = offset === 0 ? [1, 2] : offset === 2 ? [3, 4] : [];
      return { data: pagina.slice(0, pageSize), error: null };
    }, 2);
    expect(offsets).toEqual([0, 2, 4]);
  });
});
