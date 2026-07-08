/**
 * Provisiona email@exemplo.com e roda o teste de troca de senha.
 * Requer no .env: SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const TEST_EMAIL = "email@exemplo.com";
const TEMP_PASS = "SenhaTemp123";
const NEW_PASS = "NovaSenha456";

function loadEnv() {
  const path = resolve(import.meta.dir, "../.env");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error("[ERRO] Defina SUPABASE_SERVICE_ROLE_KEY no .env para criar o usuário de teste.");
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });

async function ensureUser() {
  const { data: perfilRow } = await admin
    .from("usuarios_perfil")
    .select("user_id")
    .eq("email", TEST_EMAIL)
    .maybeSingle();

  let userId = perfilRow?.user_id as string | undefined;

  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: TEMP_PASS,
      email_confirm: true,
    });
    if (error) throw error;
    console.log("[OK] Usuário existente — senha resetada para SenhaTemp123");
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEMP_PASS,
      email_confirm: true,
      user_metadata: { nome: "Usuário Teste" },
    });
    if (error?.message?.includes("already been registered")) {
      console.error("[ERRO] Usuário existe no Auth mas sem perfil. Crie o perfil em Configurações.");
      process.exit(1);
    }
    if (error) throw error;
    userId = data.user!.id;
    console.log("[OK] Usuário criado:", TEST_EMAIL);
  }

  const { error: perfilErr } = await admin.from("usuarios_perfil").upsert(
    {
      user_id: userId!,
      email: TEST_EMAIL,
      nome: "Usuário Teste",
      perfil: "assistente",
      ativo: true,
      must_change_password: true,
    },
    { onConflict: "user_id" },
  );
  if (perfilErr) throw perfilErr;
  console.log("[OK] must_change_password = true");
}

async function main() {
  console.log("=== Setup usuário de teste ===\n");
  await ensureUser();

  console.log("\n=== Rodando teste de fluxo ===\n");
  const r = spawnSync(
    "bun",
    ["run", "scripts/test_troca_senha_flow.ts", TEST_EMAIL, TEMP_PASS, NEW_PASS],
    { stdio: "inherit", cwd: resolve(import.meta.dir, "..") },
  );
  process.exit(r.status ?? 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
