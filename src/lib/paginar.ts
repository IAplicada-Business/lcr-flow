// Paginação genérica pra contornar o db-max-rows do PostgREST (Supabase) —
// espelha supabase/functions/conciliar/paginar.ts (mesma lógica, runtime
// diferente: aqui roda no server function do TanStack Start, não em Deno).
//
// #bugfix-1170: o PostgREST tem um limite físico de linhas por requisição
// (db-max-rows, tipicamente 1000) que ignora um .range() maior que isso — sem
// paginar em loop até esgotar, dados além da primeira página somem em
// silêncio (já causou bloqueio no export SCI e contagem errada de revisão
// pendente). Um `.order()` com chave secundária estável no caller (ex. "id")
// evita repetir/pular linhas entre páginas quando a chave primária tem empates.
export async function paginarTodas<T>(
  montarQuery: (offset: number, pageSize: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const todas: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await montarQuery(offset, pageSize);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return todas;
}
