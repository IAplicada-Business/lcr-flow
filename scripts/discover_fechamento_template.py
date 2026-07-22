#!/usr/bin/env python3
"""
Fase 0 — Calibração Gestta: fechamento anual 2025 (BALANCETE + CONCILIAÇÕES).

Calibração 22/07/2026:
  - Template: DEMONSTRATIVOS DO FECHAMENTO ANUAL (61cde47d37a0e7000628dd95)
  - Nome da tarefa na API: BALANCETE DE FECHAMENTO ANUAL
  - Listagem: company_task + competência 2025-01..2026-01 → 682 tarefas (G1 ≥650)
  - Anexos em company_documents[].file (URL S3), NÃO document_request

Uso (VPS, da raiz /opt/lcr):
  PYTHONUTF8=1 venv/bin/python3 scripts/discover_fechamento_template.py
  PYTHONUTF8=1 venv/bin/python3 scripts/discover_fechamento_template.py --amostra MASCA --baixar
"""
import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from gestta import api_docs  # noqa: E402

GESTTA_SEARCH = "https://api.gestta.com.br/core/customer/task/search"
SESSION_FILE = ROOT / "sessions" / "gestta-session.json"
FECHAMENTO_COMPANY_TASK = "61cde47d37a0e7000628dd95"
FECHAMENTO_SLOTS = {"BALANCETE", "CONCILIACOES"}
OUT = ROOT / "outputs" / "fechamento"


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper().strip()


def _gestta_jwt() -> str:
    s = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    for o in s.get("origins", []):
        for kv in o.get("localStorage", []):
            if kv.get("name") == "ngStorage-jwt":
                return json.loads(kv["value"])
    raise RuntimeError("token ngStorage-jwt não encontrado na sessão Gestta")


def body_fechamento(company_task: list, status: str) -> dict:
    return {
        "type": ["SERVICE_ORDER", "RECURRENT", "ACCOUNTING"],
        "company_task": company_task,
        "start_date": "2025-01-01T03:00:00.000Z",
        "end_date": "2026-01-01T02:59:59.999Z",
        "date_type": "COMPETENCE",
        "status": [status],
        "os_workflow": True,
        "overdue": False,
        "downloaded": False,
        "not_downloaded": False,
        "fine": False,
        "on_time": False,
        "collaborator": False,
        "no_owner": False,
        "email_not_sent": False,
        "document_request_sent": False,
        "without_external_user": False,
        "os_free": False,
        "limit": 100,
    }


def search_paginado(body_base: dict, jwt: str) -> list:
    headers = {"Authorization": jwt, "Content-Type": "application/json"}
    vistos, out = set(), []
    page = 1
    while True:
        body = {**body_base, "page": page}
        r = requests.post(GESTTA_SEARCH, headers=headers, json=body, timeout=60)
        if not r.ok:
            raise RuntimeError(f"search HTTP {r.status_code}: {r.text[:300]}")
        docs = r.json().get("docs") or []
        for d in docs:
            tid = d.get("_id")
            if tid in vistos:
                continue
            vistos.add(tid)
            cust = d.get("customer") or {}
            out.append({
                "taskId": tid,
                "nome": d.get("name") or "",
                "clienteCodigo": cust.get("code") or "",
                "clienteNome": cust.get("name") or "",
                "competence": (d.get("competence_date") or "")[:7],
                "status": d.get("status"),
            })
        if len(docs) < body_base["limit"]:
            break
        page += 1
    return out


def company_documents_slots(det: dict) -> list:
    return det.get("company_documents") or []


def slots_amostra(task_ids: list, jwt: str, max_tasks: int = 20) -> Counter:
    names = Counter()
    for tid in task_ids[:max_tasks]:
        try:
            det = api_docs.detalhe_tarefa(tid, jwt)
        except Exception as e:
            print(f"  detalhe {tid}: {e}", flush=True)
            continue
        for d in company_documents_slots(det):
            if d.get("disconsidered"):
                continue
            names[d.get("name") or "(sem nome)"] += 1
    return names


def _nome_arquivo(url: str, slot: str) -> str:
    m = re.search(r"filename%3D%22(.+?)%22", url or "")
    if m:
        return unquote(m.group(1))
    ext = ".pdf" if "pdf" in (url or "").lower() else ""
    return f"{_norm(slot).lower()}{ext}"


def baixar_amostra(task_id: str, jwt: str, destino: Path):
    destino.mkdir(parents=True, exist_ok=True)
    det = api_docs.detalhe_tarefa(task_id, jwt)
    salvos, falhas = [], []
    for d in company_documents_slots(det):
        if d.get("disconsidered"):
            continue
        slot = _norm(d.get("name") or "")
        if slot not in FECHAMENTO_SLOTS:
            continue
        url = d.get("file")
        if not url:
            falhas.append({"slot": d.get("name"), "motivo": "sem URL file"})
            continue
        nome = _nome_arquivo(url, d.get("name") or slot)
        caminho = destino / nome
        try:
            r = requests.get(url, timeout=120)
            r.raise_for_status()
            caminho.write_bytes(r.content)
            salvos.append(str(caminho))
            print(f"  OK {nome} ({len(r.content)} bytes)")
        except Exception as e:
            falhas.append({"slot": d.get("name"), "motivo": str(e)[:120]})
    print(json.dumps({"destino": str(destino), "salvos": salvos, "falhas": falhas},
                     ensure_ascii=False, indent=2))


def main():
    ap = argparse.ArgumentParser(description="Fase 0: calibração fechamento anual 2025")
    ap.add_argument("--company-task", default=FECHAMENTO_COMPANY_TASK,
                    help="ObjectId DEMONSTRATIVOS DO FECHAMENTO ANUAL")
    ap.add_argument("--amostra", help="Código cliente p/ inspecionar (ex.: MASCA)")
    ap.add_argument("--baixar", action="store_true", help="Baixa BALANCETE+CONCILIAÇÕES da amostra")
    ap.add_argument("--meta", type=int, default=650, help="Contagem mínima G1 (default 650)")
    args = ap.parse_args()

    try:
        jwt = _gestta_jwt()
    except Exception as e:
        print(f"ERRO: sessão Gestta ausente ({e}). Rode na VPS com sessions/gestta-session.json")
        sys.exit(2)

    OUT.mkdir(parents=True, exist_ok=True)
    ct = [args.company_task]

    print("=== Fase 0: fechamento anual 2025 ===")
    print(f"company_task: DEMONSTRATIVOS DO FECHAMENTO ANUAL ({args.company_task})")
    print("janela API: 2025-01-01 .. 2026-01-01 (COMPETENCE)\n")

    todas = []
    for status in ("DONE", "OPEN"):
        batch = search_paginado(body_fechamento(ct, status), jwt)
        print(f"status={status}: +{len(batch)} (merge abaixo)")
        seen = {t["taskId"] for t in todas}
        for t in batch:
            if t["taskId"] not in seen:
                todas.append(t)
                seen.add(t["taskId"])

    print(f"\nTotal único (DONE+OPEN): {len(todas)}")
    comps = Counter(t.get("competence") or "?" for t in todas)
    print("Competências (top 5):")
    for c, n in comps.most_common(5):
        print(f"  {c}: {n}")

    if len(todas) >= args.meta:
        print(f"\nG1 OK: {len(todas)} tarefas (meta ≥{args.meta})")
    else:
        print(f"\nG1 FALHOU: {len(todas)} < {args.meta}")

    ids = [t["taskId"] for t in todas]
    if ids:
        print(f"\nSlots company_documents (amostra {min(20, len(ids))} tarefas):")
        for nome, n in slots_amostra(ids, jwt).most_common():
            mark = " <-- ALVO" if _norm(nome) in FECHAMENTO_SLOTS else ""
            print(f"  {n:3d}x  {nome}{mark}")

    if args.amostra:
        cod = args.amostra.upper()
        hit = next((t for t in todas if (t.get("clienteCodigo") or "").upper() == cod), None)
        if not hit:
            print(f"\nERRO: cliente {args.amostra} não encontrado na listagem")
            sys.exit(1)
        print(f"\nAmostra {args.amostra}: taskId={hit['taskId']} comp={hit.get('competence')}")
        if args.baixar:
            dest = OUT / f"amostra_{cod}"
            baixar_amostra(hit["taskId"], jwt, dest)

    rel = {
        "meta_g1": args.meta,
        "total": len(todas),
        "company_task_id": args.company_task,
        "company_task_name": "DEMONSTRATIVOS DO FECHAMENTO ANUAL",
        "task_name": "BALANCETE DE FECHAMENTO ANUAL",
        "body_search": body_fechamento(ct, "DONE"),
        "competencias": dict(comps),
        "nota": "Anexos em company_documents[].file; competence_date majoritariamente 2024-12",
        "amostra_tarefas": todas[:5],
    }
    out_file = OUT / "fase0-descoberta.json"
    out_file.write_text(json.dumps(rel, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSalvo: {out_file}")


if __name__ == "__main__":
    main()
