"""Deploy processar-documento usando SUPABASE_ACCESS_TOKEN do LCR/.env."""
import os
import subprocess
import sys
from pathlib import Path

BACKEND_ENV = Path(__file__).resolve().parents[2] / "LCR" / ".env"
FRONT_ROOT = Path(__file__).resolve().parents[1]

for line in BACKEND_ENV.read_text(encoding="utf-8").splitlines():
    s = line.strip()
    if s.startswith("SUPABASE_ACCESS_TOKEN="):
        os.environ["SUPABASE_ACCESS_TOKEN"] = s.split("=", 1)[1].strip().strip('"')
        break
else:
    print("ERRO: SUPABASE_ACCESS_TOKEN ausente em LCR/.env")
    sys.exit(1)

r = subprocess.run(
    ["bun", "run", "scripts/deploy_processar_documento_ef.ts"],
    cwd=FRONT_ROOT,
    env=os.environ,
)
sys.exit(r.returncode)
