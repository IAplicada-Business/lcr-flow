#!/usr/bin/env python3
"""
scripts/carregar_depara_supabase.py — popula o de-para SCI no Supabase.

Lê os arquivos de config e preenche as colunas (adicionadas via migration):
  plano_contas.sci_apelido          ← De-para 'Apelido'      (ex.: 657 -> 11001)
  plano_contas.sci_historico_padrao ← De-para 'HISTORICO PADRÃO'
  historicos_contabeis.sci_apelido  ← Plano de históricos SCI 'Apelido' (ex.: 19 -> AQUISINVEST)

Casa por `codigo` -> `id`, e faz upsert em lote (merge-duplicates) só das colunas novas.
Idempotente. Roda local (usa .env com SUPABASE_SERVICE_ROLE_KEY).
"""
import os
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SR = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
H = {"apikey": SR, "Authorization": f"Bearer {SR}"}
CONFIG = ROOT / "config"
SESSION = requests.Session()


def fetch_map(tabela: str) -> dict:
    """codigo(str) -> id, paginado."""
    m, off = {}, 0
    while True:
        r = requests.get(f"{URL}/rest/v1/{tabela}",
                         headers=H, params={"select": "id,codigo", "limit": "1000", "offset": str(off)}, timeout=60)
        r.raise_for_status()
        batch = r.json()
        for x in batch:
            m[str(x["codigo"]).strip()] = x["id"]
        if len(batch) < 1000:
            break
        off += 1000
    return m


def patch_each(tabela: str, rows: list) -> int:
    """UPDATE puro por id (evita NOT NULL do caminho de INSERT do upsert)."""
    n = 0
    for row in rows:
        rid = row.pop("id")
        r = SESSION.patch(f"{URL}/rest/v1/{tabela}",
                          headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"},
                          params={"id": f"eq.{rid}"}, json=row, timeout=60)
        if not r.ok:
            raise RuntimeError(f"patch {tabela} id={rid}: {r.status_code} {r.text[:160]}")
        n += 1
    return n


def limpar(v) -> str | None:
    s = str(v).strip()
    if s in ("", "nan", "None", "-"):
        return None
    try:
        return str(int(float(s)))   # "10000.0" -> "10000"
    except ValueError:
        return s                    # texto (ex.: AQUISINVEST)


def achar(frag: str) -> Path:
    return next(f for f in CONFIG.iterdir() if frag.lower() in f.name.lower())


def main():
    # 1) plano_contas
    pc = fetch_map("plano_contas")
    print(f"plano_contas no banco: {len(pc)}")
    dep = pd.read_excel(str(achar("de-para")), dtype=str)
    rows = []
    for _, r in dep.iterrows():
        cod = limpar(r.iloc[0])             # Código LCR
        if not cod or cod not in pc:
            continue
        apel = limpar(r.iloc[4])            # Apelido SCI
        hist = str(r.iloc[6]).strip()
        hist = None if hist in ("", "nan", "None", "-") else hist
        if apel is None and hist is None:
            continue
        rows.append({"id": pc[cod], "sci_apelido": apel, "sci_historico_padrao": hist})
    print(f"plano_contas a atualizar: {len(rows)} -> upserted {patch_each('plano_contas', rows)}")

    # 2) historicos_contabeis
    hc = fetch_map("historicos_contabeis")
    print(f"historicos_contabeis no banco: {len(hc)}")
    dfh = pd.read_csv(str(achar("historicos")), encoding="latin1", sep=";",
                      header=None, skiprows=1, dtype=str, on_bad_lines="skip")
    rows2 = []
    for _, r in dfh.iterrows():
        cod = limpar(r.iloc[0])
        if not cod or cod not in hc:
            continue
        apel = str(r.iloc[1]).strip()
        if apel in ("", "nan", "None"):
            continue
        rows2.append({"id": hc[cod], "sci_apelido": apel})
    print(f"historicos a atualizar: {len(rows2)} -> upserted {patch_each('historicos_contabeis', rows2)}")


if __name__ == "__main__":
    main()
