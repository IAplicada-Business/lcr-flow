# n8n — Orquestração PROC-001 (Etapas 1–4)

Agenda e dispara o orquestrador (`src/orquestrar.py`), que percorre todas as tarefas
COBRANÇA de uma competência e executa: suficiência (IA) → baixa docs → classifica →
envia ao front para revisão humana. **A automação não escreve no Gestta.**

## Workflow
`proc001-cobranca.json` — importe em n8n (Workflows → Import from File).
Nós: **A cada 4h** (Schedule) → **Orquestrar PROC-001** (Execute Command) →
**Falhou?** (IF exitCode≠0) → **Alerta Slack** (usa `SLACK_WEBHOOK_URL`).

## Como o n8n executa (escolha conforme seu ambiente)

### Opção A — n8n em Docker chamando o container da automação (recomendada p/ servidor)
O comando do nó Execute Command já está como:
```
docker exec lcr-playwright sh -lc 'PYTHONUTF8=1 python src/orquestrar.py --competencia $(date +%Y-%m)'
```
Requer:
1. `docker compose up -d` (sobe `lcr-n8n` + `lcr-playwright`).
2. O container `lcr-n8n` precisa do **docker CLI + acesso ao docker.sock** (já montado no `docker-compose.yml`). Se a imagem padrão não tiver o `docker` CLI, use uma imagem custom (`n8nio/n8n` + `apk add docker-cli`) ou a Opção B.
3. Sessão Gestta válida em `sessions/` (montado no `lcr-playwright`).

### Opção B — n8n local (host) chamando o Python do host (mais simples p/ testar agora)
Rode o n8n no host (ex.: `npx n8n`) e troque o comando do nó para:
```
python src/orquestrar.py --competencia <YYYY-MM>
```
(executa direto no host, onde Python + deps já funcionam).

## Pré-requisitos
- Sessão Gestta: `npm run save-session:gestta` (login manual; salva sozinho).
- `.env` com `SUPABASE_*`, `SUPABASE_SVC_EMAIL/PASSWORD`, `ANTHROPIC_API_KEY`, `SLACK_WEBHOOK_URL`.

## Teste manual (sem n8n)
```
PYTHONUTF8=1 python src/orquestrar.py --competencia 2026-06 --cliente CAPI   # 1 cliente
PYTHONUTF8=1 python src/orquestrar.py --competencia 2026-06 --limite 3        # lote pequeno
PYTHONUTF8=1 python src/orquestrar.py --competencia 2026-06                    # todas
```
Logs por execução em `outputs/orquestracao/run-<competencia>-<ts>.json`.

> Escala: `buscarTarefasCobranca` clica em cada card p/ extrair o taskId (lento com muitas
> tarefas). Use `--limite` por enquanto; o resolver direcionado é o próximo passo.
