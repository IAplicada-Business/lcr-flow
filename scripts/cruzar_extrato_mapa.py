#!/usr/bin/env python3
"""Cruza transações de um extrato demo com as regras do Mapa + classificação IA."""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT_LCR = Path(__file__).resolve().parent.parent.parent / "LCR"
ROOT_FRONT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_LCR / "src"))

from ai.motor_classificacao import carregar_mapa_transacoes, classificar_extrato  # noqa: E402

CSV = ROOT_FRONT / "docs-demo" / "csvs-conciliacao" / "extrato-cava-junho-2026.csv"
OUT = ROOT_FRONT / "outputs" / "cava-extrato-mapa-cruzamento.json"
BANCO_ITAU = 657
COMP = "06/2026"
BANCO_PLACEHOLDERS = {"809", "9", "657", "7", "8", "10"}


def cod_conta(s: str | None) -> str | None:
    if not s:
        return None
    m = re.search(r"(\d+)", str(s))
    return m.group(1) if m else None


def resolver_banco(cod: str | None, banco_real: int) -> int | str | None:
    if cod is None:
        return None
    return banco_real if cod in BANCO_PLACEHOLDERS else int(cod)


def main() -> None:
    import os
    os.chdir(ROOT_LCR)

    mapa_list = carregar_mapa_transacoes()
    mapa = {r["id"]: r for r in mapa_list}

    txs = []
    with CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if "SALDO" in row["descricao"].upper():
                continue
            txs.append({
                "data": row["data"].replace("-", ""),
                "tipo": row["tipo"],
                "valor": float(row["valor"]),
                "descricao": row["descricao"],
            })

    res = classificar_extrato(txs, conta_banco=BANCO_ITAU, competencia=COMP)
    por_idx = {c.get("idx", i + 1): c for i, c in enumerate(
        res["aprovadas"] + [x["classificacao_sugerida"] for x in res["revisao_manual"]]
    )}

    linhas = []
    for i, tx in enumerate(txs, start=1):
        cls = por_idx.get(i, {})
        rid = cls.get("regra_id") or "DEPARA"
        regra = mapa.get(rid) if rid in mapa else None
        esp = {}
        if regra:
            esp = {
                "tipo_mapa": regra.get("tipo"),
                "gatilho": (regra.get("gatilho") or "")[:120],
                "debito_esperado": resolver_banco(cod_conta(regra.get("conta_deb")), BANCO_ITAU),
                "credito_esperado": resolver_banco(cod_conta(regra.get("conta_cred")), BANCO_ITAU),
                "historico_esperado": regra.get("cod_hist"),
            }

        linhas.append({
            "data": tx["data"],
            "descricao_extrato": tx["descricao"],
            "valor": tx["valor"],
            "tipo_movimento": tx["tipo"],
            "regra_id": rid,
            "confianca": cls.get("confianca"),
            "status": "aprovada" if (cls.get("confianca") or 0) >= 0.8 else "revisao_manual",
            "mapa": esp,
            "classificacao_ia": {
                "debito": cls.get("debito"),
                "credito": cls.get("credito"),
                "historico": cls.get("historico"),
                "complemento": cls.get("complemento"),
                "justificativa": cls.get("justificativa"),
            },
        })

    payload = {
        "fonte": str(CSV),
        "empresa": "CAVA Desenvolvimento Humano (demo)",
        "banco_sci": BANCO_ITAU,
        "competencia": COMP,
        "resumo": res["resumo"],
        "linhas": linhas,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"\nSalvo: {OUT}")


if __name__ == "__main__":
    main()
