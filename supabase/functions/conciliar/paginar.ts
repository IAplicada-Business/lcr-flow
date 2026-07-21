// Paginação genérica pra contornar o db-max-rows do PostgREST (Supabase).
// Extraído de index.ts pra ser testável sem disparar Deno.serve() (code
// review 20/07 — sem testes anteriormente).
//
// #bugfix-1170 (mesmo motivo do PostgREST db-max-rows silencioso que já causou
// o bug "não consigo baixar a planilha"): sem paginar em loop, um .range() com
// teto fixo (ou nenhum .range()) trunca silenciosamente em ~1000 linhas por
// requisição — cliente com muitos lançamentos numa competência teria
// revisão/saldo/faltantes calculados sobre dados incompletos, sem erro visível.
// .order("id") como chave secundária (no caller) garante paginação estável.
export async function paginarTodas<T>(
  montarQuery: (offset: number, pageSize: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const todas: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await montarQuery(offset, pageSize);
    if (error) return { data: null, error };
    todas.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return { data: todas, error: null };
}
