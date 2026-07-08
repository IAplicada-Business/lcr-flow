#!/usr/bin/env python3
"""Diagnóstico do fluxo de troca de senha em produção."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

URL = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").rstrip("/")
SR = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
ANON = os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or ""
DEFAULT_PWD = os.getenv("DEFAULT_USER_PASSWORD") or "LCR2026"
H = {"apikey": SR, "Authorization": f"Bearer {SR}", "Accept": "application/json"}


def main() -> None:
    if not URL or not SR:
        print("[ERRO] .env sem SUPABASE_URL / SERVICE_ROLE")
        sys.exit(1)

    emails = []
    csv_path = Path(__file__).parent.parent / "config" / "colaboradores_contabil.csv"
    if csv_path.exists():
        import csv
        with csv_path.open(encoding="utf-8-sig") as f:
            emails = [r["email"].strip().lower() for r in csv.DictReader(f) if r.get("email")]

    r = requests.get(
        f"{URL}/rest/v1/usuarios_perfil",
        headers=H,
        params={
            "select": "user_id,email,nome,must_change_password,updated_at",
            "ativo": "eq.true",
            "order": "email",
        },
        timeout=60,
    )
    r.raise_for_status()
    perfis = r.json()

    if emails:
        perfis = [p for p in perfis if p["email"] in emails]

    ainda = [p for p in perfis if p.get("must_change_password")]
    trocou = [p for p in perfis if not p.get("must_change_password")]

    print(f"=== usuarios_perfil ({len(perfis)} colaboradores) ===")
    print(f"  must_change_password=TRUE  (ainda na tela de troca): {len(ainda)}")
    print(f"  must_change_password=FALSE (concluir_troca_senha OK): {len(trocou)}")

    if ainda:
        print("\n--- Ainda com flag TRUE ---")
        for p in ainda:
            print(f"  {p['email']}")

    # Testa login provisório vs amostra de quem "trocou"
    if not ANON:
        print("\n(sem ANON key — pulando teste de login)")
        return

    lh = {"apikey": ANON, "Content-Type": "application/json"}
    print(f"\n=== Teste login senha provisória ({DEFAULT_PWD}) ===")
    prov_ok = prov_fail = 0
    for p in perfis[:29]:
        lr = requests.post(
            f"{URL}/auth/v1/token?grant_type=password",
            headers=lh,
            json={"email": p["email"], "password": DEFAULT_PWD},
            timeout=30,
        )
        flag = "TROCOU" if not p.get("must_change_password") else "PENDENTE"
        if lr.ok:
            prov_ok += 1
            print(f"  OK provisória  [{flag}] {p['email']}")
        else:
            prov_fail += 1
            print(f"  FAIL provisória [{flag}] {p['email']} — provavelmente já definiu senha própria")

    print(f"\nResumo login provisória: {prov_ok} OK, {prov_fail} FAIL (FAIL = senha já alterada no Auth)")


if __name__ == "__main__":
    main()
