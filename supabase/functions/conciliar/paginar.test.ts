import { assertEquals } from "jsr:@std/assert@1";
import { paginarTodas } from "./paginar.ts";

Deno.test("paginarTodas — 0 páginas (resultado vazio)", async () => {
  const { data, error } = await paginarTodas<number>(async () => ({ data: [], error: null }), 3);
  assertEquals(error, null);
  assertEquals(data, []);
});

Deno.test("paginarTodas — uma única página menor que pageSize (não busca a próxima)", async () => {
  let chamadas = 0;
  const { data, error } = await paginarTodas<number>(async () => {
    chamadas++;
    return { data: [1, 2], error: null };
  }, 5);
  assertEquals(error, null);
  assertEquals(data, [1, 2]);
  assertEquals(chamadas, 1);
});

Deno.test("paginarTodas — várias páginas cheias seguidas de uma parcial, acumula tudo", async () => {
  const paginas = [
    [1, 2, 3],
    [4, 5, 6],
    [7], // parcial — sinaliza fim
  ];
  let i = 0;
  const { data, error } = await paginarTodas<number>(async () => ({ data: paginas[i++] ?? [], error: null }), 3);
  assertEquals(error, null);
  assertEquals(data, [1, 2, 3, 4, 5, 6, 7]);
  assertEquals(i, 3, "não deve chamar uma 4ª vez depois da página parcial");
});

Deno.test("paginarTodas — última página com exatamente pageSize itens ainda busca a próxima (vazia) antes de parar", async () => {
  const paginas = [
    [1, 2, 3],
    [], // página cheia anterior tinha exatamente pageSize — precisa confirmar que acabou
  ];
  let i = 0;
  const { data } = await paginarTodas<number>(async () => ({ data: paginas[i++] ?? [], error: null }), 3);
  assertEquals(data, [1, 2, 3]);
  assertEquals(i, 2);
});

Deno.test("paginarTodas — erro numa página interrompe o loop e propaga o erro", async () => {
  let chamadas = 0;
  const { data, error } = await paginarTodas<number>(async () => {
    chamadas++;
    if (chamadas === 2) return { data: null, error: { message: "boom" } };
    return { data: [1, 2, 3], error: null };
  }, 3);
  assertEquals(data, null);
  assertEquals(error?.message, "boom");
  assertEquals(chamadas, 2, "não deve continuar buscando páginas depois do erro");
});

Deno.test("paginarTodas — data null numa página é tratado como fim (sem erro)", async () => {
  const { data, error } = await paginarTodas<number>(async () => ({ data: null, error: null }), 3);
  assertEquals(error, null);
  assertEquals(data, []);
});

Deno.test("paginarTodas — offset/pageSize passados pro montarQuery avançam corretamente", async () => {
  const chamadasComOffset: number[] = [];
  await paginarTodas<number>(async (offset, pageSize) => {
    chamadasComOffset.push(offset);
    const pagina = offset === 0 ? [1, 2] : offset === 2 ? [3, 4] : [];
    return { data: pagina.slice(0, pageSize), error: null };
  }, 2);
  assertEquals(chamadasComOffset, [0, 2, 4]);
});
