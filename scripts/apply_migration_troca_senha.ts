/** Tenta aplicar migration via Postgres ou Supabase CLI. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function loadEnv() {
  const path = resolve(import.meta.dir, "../.env");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const ref = process.env.SUPABASE_PROJECT_ID ?? "slewrhdxxtqcdsnpxxwo";
const password = process.env.SUPABASE_DB_PASSWORD ?? process.env.DATABASE_PASSWORD;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

async function viaPostgres() {
  const postgres = (await import("postgres")).default;
  const migration = readFileSync(
    resolve(import.meta.dir, "../supabase/migrations/20260707210000_must_change_password.sql"),
    "utf8",
  );
  const sql = postgres({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    database: "postgres",
    username: "postgres",
    password: password!,
    ssl: "require",
    max: 1,
  });
  try {
    await sql.unsafe(migration);
    console.log("[OK] Migration aplicada via Postgres.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function viaCli() {
  const env = {
    ...process.env,
    SUPABASE_PROJECT_ID: ref,
    SUPABASE_ACCESS_TOKEN: accessToken!,
    SUPABASE_DB_PASSWORD: password!,
  };
  const link = spawnSync(
    "supabase",
    ["link", "--project-ref", ref, "-p", password!, "--yes"],
    { cwd: resolve(import.meta.dir, ".."), env, stdio: "pipe", encoding: "utf8" },
  );
  if (link.status !== 0) {
    throw new Error(link.stderr || link.stdout || "supabase link falhou");
  }
  const push = spawnSync(
    "supabase",
    ["db", "push", "--yes", "--include-all"],
    { cwd: resolve(import.meta.dir, ".."), env, stdio: "inherit" },
  );
  if (push.status !== 0) process.exit(push.status ?? 1);
  console.log("[OK] Migration aplicada via supabase db push.");
}

async function main() {
  if (password) {
    await viaPostgres();
    return;
  }
  if (accessToken && password) {
    viaCli();
    return;
  }
  console.error("[ERRO] Falta SUPABASE_DB_PASSWORD no .env para aplicar a migration.");
  console.error("       Dashboard Supabase → Settings → Database → Database password");
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
