#!/usr/bin/env python3
"""Compara lançamentos em produção (Supabase) com o Mapa de Transações Típicas."""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

ROOT_LCR = Path(__file__).resolve().parent.parent.parent / "LCR"
ROOT_FRONT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_FRONT / ".env")

URL = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").rstrip("/")
SR = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
HEADERS = {"apikey": SR, "Authorization": f"Bearer {SR}", "Accept": "application/json"}


def carregar_mapa() -> dict[str, dict]:
    path = ROOT_LCR / "config" / "Modelo de mapeamento das transações típicas.xlsx"
    df = pd.read_excel(path, header=2)
    df.columns = [
        "ID", "DOC_ORIGEM", "TIPO", "GATILHO", "CONTA_DEB", "CONTA_CRED",
        "PARTICIPANTE", "COD_HIST", "TEXTO_HIST", "REGRA_COMPLEMENTO", "DOC", "OBSERVACOES",
    ]
    rules = {}
    for _, r in df.iterrows():
        rid = str(r["ID"]).strip()
        if not rid or not rid[0].isalpha():
            continue
        def cod(s):
            s = str(s or "")
            m = __import__("re").search(r"(\d+)", s)
            return m.group(1) if m else None
        rules[rid] = {
            "tipo": str(r["TIPO"]),
            "conta_deb": cod(r["CONTA_DEB"]),
            "conta_cred": cod(r["CONTA_CRED"]),
            "hist": str(r["COD_HIST"]).strip() if pd.notna(r["COD_HIST"]) else None,
        }
    return rules


def extrair_regra_sugestao(classificacao_ia) -> str | None:
    if not isinstance(classificacao_ia, dict):
        return None
    fonte = classificacao_ia.get("dados_extraidos") or {}
    if isinstance(fonte, dict) and fonte.get("fonte", "").startswith("motor_lcr"):
        for s in classificacao_ia.get("lancamentos_sugeridos") or []:
            j = s.get("justificativa") or ""
            for token in j.split():
                if token.startswith(("FP-", "TR-", "FO-", "EN-", "UT-", "BC-", "RC-")):
                    return token.rstrip(".,;")
    for s in classificacao_ia.get("lancamentos_sugeridos") or []:
        if s.get("regra_id"):
            return str(s["regra_id"])
    return None


def main() -> None:
    if not URL or not SR:
        print("[ERRO] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env")
        sys.exit(1)

    mapa = carregar_mapa()
    print(f"Mapa carregado: {len(mapa)} regras")

    r = requests.get(
        f"{URL}/rest/v1/lancamentos",
        headers=HEADERS,
        params={
            "select": "id,descricao,valor,competencia,confidence,conta:conta_id(codigo,descricao),historico:historico_id(codigo),documento:documento_id(classificacao_ia,arquivo_nome,origem)",
            "fonte_extrato": "eq.true",
            "order": "created_at.desc",
            "limit": "200",
        },
        timeout=90,
    )
    r.raise_for_status()
    rows = r.json()
    print(f"Lançamentos analisados: {len(rows)}")

    por_conta_hist = Counter()
    por_regra = Counter()
    divergencias = []
    sem_regra = []

    for row in rows:
        conta = (row.get("conta") or {}).get("codigo")
        hist = (row.get("historico") or {}).get("codigo")
        por_conta_hist[(conta, hist)] += 1

        doc = row.get("documento") or {}
        ci = doc.get("classificacao_ia")
        regra = extrair_regra_sugestao(ci)
        if regra:
            por_regra[regra] += 1
            esperado = mapa.get(regra)
            if esperado and esperado.get("hist") and hist and str(hist) != str(esperado["hist"]):
                divergencias.append({
                    "desc": (row.get("descricao") or "")[:60],
                    "regra": regra,
                    "hist_esperado": esperado["hist"],
                    "hist_gravado": hist,
                    "conta": conta,
                    "comp": row.get("competencia"),
                })
        else:
            sem_regra.append({
                "desc": (row.get("descricao") or "")[:60],
                "conta": conta,
                "hist": hist,
                "conf": row.get("confidence"),
                "origem": doc.get("origem"),
            })

    print("\n=== Top conta + histórico (produção) ===")
    for (c, h), n in por_conta_hist.most_common(15):
        print(f"  conta {c} / hist {h}: {n}x")

    print("\n=== Regras detectadas no JSON ===")
    for regra, n in por_regra.most_common(15):
        print(f"  {regra}: {n}x")

    print(f"\n=== Divergências histórico Mapa vs gravado: {len(divergencias)} ===")
    for d in divergencias[:10]:
        print(f"  [{d['regra']}] {d['desc']} — esperado hist {d['hist_esperado']}, gravado {d['hist_gravado']}")

    print(f"\n=== Sem regra_id rastreável: {len(sem_regra)} (amostra) ===")
    for s in sem_regra[:8]:
        print(f"  {s['desc']} | conta {s['conta']} hist {s['hist']} conf {s['conf']} origem {s['origem']}")

    # Gaps no Mapa: padrões frequentes sem regra óbvia
    gaps = defaultdict(int)
    keywords = {
        "aluguel": "FO-05?",
        "pix": "FO-01/RC-04",
        "folha": "FP-01",
        "salario": "FP-01",
        "tarifa": "BC-01",
        "darf": "TR-*",
        "energia": "UT-01",
    }
    for row in rows:
        desc = (row.get("descricao") or "").lower()
        for kw, sug in keywords.items():
            if kw in desc:
                gaps[sug] += 1

    print("\n=== Padrões frequentes (validação de cobertura do Mapa) ===")
    for k, v in sorted(gaps.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}x")

    out = ROOT_FRONT / "outputs" / "validacao-mapa-producao.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "total": len(rows),
        "por_regra": dict(por_regra),
        "divergencias": divergencias[:30],
        "sem_regra_amostra": sem_regra[:30],
        "gaps": dict(gaps),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSalvo: {out}")


if __name__ == "__main__":
    main()
