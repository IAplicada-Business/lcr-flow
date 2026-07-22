#!/usr/bin/env python3
"""
Torna a razão da conciliação BINÁRIA (extrato = fonte; suporte = validação):
  1) BACKFILL: fonte_extrato=true nos lançamentos cujo documento é tipo='extrato'
     (corrige os lançamentos do agente que nasceram sem a flag).
  2) REMOVE: lançamentos cujo documento é de SUPORTE (tipo != 'extrato') — legado
     que não deveria estar na razão. Os DOCUMENTOS de suporte permanecem; só os
     lançamentos indevidos saem. Lançamentos manuais (documento_id null) ficam.
  3) ENRIQUECE: dispara enriquecer-extrato nas (empresa, competência) que têm
     extrato + docs de suporte, p/ preencher participante/nº nota.

Uso (na VPS):
  venv/bin/python3 scripts/tornar_binario.py            # dry-run (não altera)
  venv/bin/python3 scripts/tornar_binario.py --apply    # executa
"""
import sys
import collections
import requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for sub in ("src", "src/ai", "src/sci"):
    sys.path.insert(0, str(ROOT / sub))
import bridge_front as bf  # noqa: E402


def get_all(tabela, params):
    out, off = [], 0
    while True:
        r = requests.get(f"{bf.URL}/rest/v1/{tabela}",
                         headers={**bf.SR_HEADERS, "Range-Unit": "items", "Range": f"{off}-{off+999}"},
                         params=params, timeout=60)
        r.raise_for_status()
        b = r.json(); out.extend(b)
        if len(b) < 1000:
            break
        off += 1000
    return out


def chunks(lst, n=100):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def main():
    apply = "--apply" in sys.argv

    docs = get_all("documentos", {"select": "id,tipo,empresa_id,competencia"})
    doc_tipo = {d["id"]: d["tipo"] for d in docs}
    extrato_ids = {d["id"] for d in docs if d["tipo"] == "extrato"}
    suporte_ids = {d["id"] for d in docs if d["tipo"] != "extrato"}

    lanc = get_all("lancamentos", {"select": "id,documento_id,fonte_extrato,empresa_id,competencia"})
    backfill = [l for l in lanc if l.get("documento_id") in extrato_ids and l.get("fonte_extrato") is not True]
    remover = [l for l in lanc if l.get("documento_id") in suporte_ids]

    print(f"documentos: {len(docs)} (extrato={len(extrato_ids)}, suporte={len(suporte_ids)})")
    print(f"lançamentos: {len(lanc)}")
    print(f"\n1) BACKFILL fonte_extrato=true (lançamentos de extrato sem flag): {len(backfill)}")
    print(f"2) REMOVER (lançamentos de docs de suporte): {len(remover)}")
    if remover:
        print("   por tipo de documento:", dict(collections.Counter(doc_tipo.get(l["documento_id"]) for l in remover)))

    sup_pairs = {(d["empresa_id"], d["competencia"]) for d in docs if d["tipo"] != "extrato"}
    ext_pairs = {(l["empresa_id"], l["competencia"]) for l in lanc if l.get("documento_id") in extrato_ids}
    afet = sorted(ext_pairs & sup_pairs)
    print(f"3) ENRIQUECER (empresa,competência com extrato + suporte): {len(afet)}")

    if not apply:
        print("\n>>> DRY-RUN — nada alterado. Rode com --apply para executar.")
        return

    # 1) backfill
    ids_bf = [l["id"] for l in backfill]
    for ch in chunks(ids_bf):
        r = requests.patch(f"{bf.URL}/rest/v1/lancamentos",
                           headers={**bf.SR_HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
                           params={"id": f"in.({','.join(ch)})"}, json={"fonte_extrato": True}, timeout=60)
        r.raise_for_status()
    print(f"\n✓ backfill aplicado: {len(ids_bf)}")

    # 2) remover
    ids_rm = [l["id"] for l in remover]
    for ch in chunks(ids_rm):
        r = requests.delete(f"{bf.URL}/rest/v1/lancamentos",
                            headers={**bf.SR_HEADERS, "Prefer": "return=minimal"},
                            params={"id": f"in.({','.join(ch)})"}, timeout=60)
        r.raise_for_status()
    print(f"✓ removidos: {len(ids_rm)}")

    # 3) enriquecer
    jwt = bf.obter_jwt()
    ok = 0
    for emp, comp in afet:
        try:
            bf.chamar_edge("enriquecer-extrato", {"empresa_id": emp, "competencia": comp}, jwt)
            ok += 1
        except Exception as e:
            print(f"  enriquecer {emp} {comp} falhou: {str(e)[:100]}")
    print(f"✓ enriquecer-extrato disparado: {ok}/{len(afet)}")


if __name__ == "__main__":
    main()
