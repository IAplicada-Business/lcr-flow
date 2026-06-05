## Visão geral

Sistema corporativo interno do escritório LCR Contábil para gerir o ciclo mensal de Integração e Conciliação Bancária de clientes. Frontend React + TanStack Start + Tailwind, backend Supabase (Auth + Postgres com RLS). Toda a UI segue a identidade IAplicada (off-white + oliva). Dados realistas mockados, marcados `[DEMO]`, até as integrações reais (Gestta, SCI, LevelDrive, SharePoint) serem ligadas.

## Identidade visual (design system)

Tokens em `src/styles.css` (oklch), aplicados via Tailwind v4 `@theme`:

- `--background` #f7f6f0, `--card` #ffffff, `--border` #e5e3d6
- `--primary` #6f7f3d, `--primary-hover` #566627, `--accent-lime` #aebd7e
- `--deep-panel` #2f3a1c / `--deep-panel-fg` #f3f4ea (painéis de ênfase)
- `--foreground` #1e2216, `--muted-foreground` #7a7c6c, `--soft-fg` #4b4f3f
- Status pills: `now` (oliva sólido), `doing` (sage claro), `next` (outline), `back` (amarelado)
- Fontes: Inter (UI) + Playfair Display (títulos, com variante `italic` oliva para ênfase tipo "para a *LCR*")
- Radius 6px, sombras suaves, sem emojis

Logo LCR carregada como asset (Lovable Assets) e exibida no sidebar; wordmark "IAplicada" no login com "plicada" em oliva escuro.

## Banco de dados (Supabase migration)

Tabelas em `public` com GRANTs, RLS habilitado e políticas para `authenticated` (todo usuário LCR vê tudo — é um escritório único; sem multi-tenant por enquanto):

- `empresas`, `contas_bancarias`, `documentos_esperados`, `documentos`, `lancamentos`, `conciliacoes`, `tarefas`, `usuarios_perfil`, `integracoes`
- Enums: `regime_tributario`, `documento_tipo`, `documento_status`, `documento_origem`, `lancamento_status`, `conciliacao_status`, `tarefa_tipo`, `tarefa_status`, `perfil_usuario`
- Trigger `update_updated_at_column` onde aplicável
- Trigger `handle_new_user` cria `usuarios_perfil` com perfil `assistente` no signup
- Função `has_perfil(uid, perfil)` security definer (preparada para evolução futura de RBAC)
- Seed via migration: ~6 empresas DEMO + contas + documentos + tarefas + conciliações (com flag/observação `[DEMO]` no campo `nome` ou similar)

## Autenticação

- Rota pública `/auth` (login + signup email/senha), Supabase Auth, `emailRedirectTo: window.location.origin`
- Layout `src/routes/_authenticated/route.tsx` com `ssr: false` + `beforeLoad` que valida `supabase.auth.getUser()` e redireciona para `/auth`
- Listener `onAuthStateChange` no `__root.tsx` para invalidar router/query cache
- Sign-out: cancelQueries → clear → signOut → navigate `/auth` replace

## Estrutura de rotas

```
src/routes/
  __root.tsx                       (providers + auth listener)
  index.tsx                        (redirect → /app ou /auth)
  auth.tsx                         (login IAplicada)
  _authenticated/
    route.tsx                      (gate + AppShell com sidebar)
    app.tsx                        (Dashboard)
    clientes.tsx                   (lista + modal novo cliente)
    clientes.$id.tsx               (detalhe com abas internas)
    documentos.tsx
    lancamentos.tsx
    conciliacao.tsx
    conciliacao.$empresaId.tsx     (tela 2-colunas razão x extrato)
    tarefas.tsx                    (Kanban)
    configuracoes.tsx              (com sub-abas: integrações / usuários / plano de contas)
```

## Módulos (todos com dados Supabase reais, seedados [DEMO])

1. **Dashboard** — 4 stat cards (counts via queries), gráfico de fases do ciclo (Recharts), lista "Atenção urgente"
2. **Clientes** — tabela com filtros (regime, consultor, tag, status), modal `+ Novo cliente` em wizard de 1 página (dados básicos / contas bancárias dinâmicas / checklist docs esperados / tags / consultor). Detalhe com Tabs shadcn
3. **Documentos** — tabela global com filtros, modal `+ Upload manual` (sem storage real ainda — grava metadata), drawer de detalhe com preview placeholder + campos extraídos (jsonb) + botão "marcar como classificado"
4. **Lançamentos Contábeis** — agrupado por cliente, botão `Gerar planilha SCI` abre modal com preview tabular mockado; histórico de planilhas com status
5. **Conciliação** — lista por cliente do mês; tela 2-colunas razão SCI x extrato com marcadores de divergência (mockados)
6. **Tarefas** — Kanban 3 colunas com `@dnd-kit/core` (drag-and-drop), cards por cliente com prazo + responsável, filtro por consultor
7. **Configurações** — Tabs: Integrações (formulários Gestta/SCI/LevelDrive/SharePoint salvando em `integracoes.config`), Usuários (lista de `usuarios_perfil`), Plano de contas (árvore mockada)

## Padrões técnicos

- Server functions `createServerFn` + `requireSupabaseAuth` para todas as leituras/escritas → loaders + `useSuspenseQuery`
- Componentes shadcn já presentes (Table, Dialog, Tabs, Badge, Card, Form, etc.)
- AppShell em `src/components/app-shell.tsx` (sidebar fixa esquerda 240px, header com nome do usuário + sign-out)
- Componente `StatusPill` reutilizável com variantes now/doing/next/back
- Dependências novas: `@dnd-kit/core`, `@dnd-kit/sortable`, `recharts` (já), `date-fns`

## Ordem de execução

1. Migration Supabase (tabelas + RLS + seed [DEMO])
2. Design tokens em `src/styles.css` + fontes Google
3. Auth (rota /auth + layout `_authenticated` + listener root)
4. AppShell + logo asset + StatusPill
5. Dashboard
6. Clientes (lista + modal novo + detalhe abas)
7. Documentos
8. Lançamentos
9. Conciliação
10. Tarefas (Kanban dnd-kit)
11. Configurações

## Notas

- "Apenas LCR vê" interpretado como: todo `authenticated` do projeto = staff LCR (escritório único). RLS = `auth.uid() IS NOT NULL`. Caso queira multi-escritório no futuro, adicionamos coluna `tenant_id`.
- Upload de arquivos reais (documentos, plano de contas) fica como `arquivo_url TEXT` por enquanto; storage bucket pode ser adicionado depois.
- Integrações reais (Gestta API, SCI, LevelDrive, SharePoint) são apenas formulários por enquanto — sem chamadas externas.
- Sem animações além de transições suaves de hover/focus, conforme pedido.
