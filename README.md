# LCR Contábil

Sistema interno da LCR para integração de documentos, lançamentos contábeis e
conciliação bancária dos clientes. Frontend em React + TanStack Start + Vite,
backend e banco no **Supabase (PostgreSQL)**.

## Stack

- **Frontend (Lovable):** React, TanStack Start/Router, Vite, TypeScript, Tailwind
- **Banco/Auth/Storage:** Supabase (PostgreSQL + RLS)
- **Automação (VPS):** Python (Gestta/orquestrador), Node/Playwright (sessões Gestta/SCI), n8n
- **Gerenciador front:** Bun

Este é o repo canônico pós-reconnect Lovable (`nexus-lcr-core-*`). O antigo
`lcr-flow` fica como arquivo/histórico; front + automation passam a viver aqui.

## Desenvolvimento

```bash
bun install
bun run dev
```

Variáveis de ambiente em `.env` (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, etc.).

## Banco de dados (Supabase)

Toda a estrutura do banco é versionada em migrações SQL em
[`supabase/migrations/`](./supabase/migrations) e aplicada pelo Supabase CLI.

### Aplicar localmente

```bash
supabase start        # sobe Postgres + Studio locais (requer Docker)
supabase db reset     # recria o banco e aplica todas as migrações + seeds
```

### Aplicar em produção

```bash
supabase link --project-ref slewrhdxxtqcdsnpxxwo
supabase db push      # envia as migrações pendentes ao projeto remoto
```

### Gerar tipos TypeScript

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

O modelo de dados, as decisões de design e os desvios conscientes em relação à
especificação estão documentados em
[`supabase/README.md`](./supabase/README.md).

## Automação Gestta / VPS / Python

Pipeline:

```
Gestta → baixa documentos
  → Parser / Edge processar-documento
  → Classificação + planilha SCI
  → LevelDrive / SCI Único
```

### Setup VPS (resumo)

```bash
bash scripts/setup_vps.sh
cp .env.example .env   # preencher
bun install            # ou npm install na VPS
pip3 install -r requirements.txt
docker-compose up -d   # se usar n8n local

# Sessões (uma vez)
bun run save-session:gestta
bun run save-session:sci
bun run save-session:leveldrive
```

Scripts úteis: `src/orquestrar.py`, `src/gestta/`, `src/sci/`, `scripts/`,
`n8n/`, `docs/ARQUITETURA.md`. Arquivos de referência em `config/`.

### Apontar a VPS para este repo

```bash
cd /caminho/do/deploy
git remote set-url origin https://github.com/IAplicada-Business/nexus-lcr-core-767e5853.git
git fetch origin
git checkout main   # ou a branch de deploy
git pull
```
