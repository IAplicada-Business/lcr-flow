#!/usr/bin/env python3
"""
Backfill OPT-0004 — docs da cobrança 01/2026 gravados no mês da DUE_DATE
em vez do mês do movimento (competence_date Gestta).

Direção correta (Bruno 22/07/2026):
  2026-01 → 2025-12 (e análogo para 2025-11)

NÃO use a versão antiga deste script (que fazia 2025-12 → 2026-01).

Critérios (alta confiança):
  1) Doc em 2026-01 com ≥70% dos lançamentos no mês alvo e mais que em 2026-01
  2) Doc sem lançamento com classificacao_ia/dados_extraidos.competencia = alvo
     ou nome de arquivo tipicamente do mês alvo

Uso (preferir SQL no Supabase MCP / Studio — este script espelha a lógica):
  # Já aplicado em produção em 2026-07-22 via SQL.
  # Re-rodar só se novos misfiles aparecerem antes do deploy do orquestrar.
"""
from __future__ import annotations

# Documentação operacional — a correção em massa foi feita via SQL no projeto
# slewrhdxxtqcdsnpxxwo em 2026-07-22:
#   - 6303 docs + 21143 lançamentos → 2025-12
#   - 1174 docs → 2025-11
#   - 486 conciliacoes → 2025-12; 50 → 2025-11
#
# Orquestrar novo grava por competence_date (competencia_front_da_tarefa).

DE = "2026-01"
ALVOS = ("2025-12", "2025-11")

if __name__ == "__main__":
    print(
        "Backfill OPT-0004 já aplicado em produção (2026-07-22).\n"
        f"Origem típica: {DE} → alvos {', '.join(ALVOS)}.\n"
        "Para reaplicar, use o SQL versionado em docs/ ou o histórico do agent."
    )
