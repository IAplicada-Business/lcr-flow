/**
 * Verifica se a migration de troca de senha está aplicada no Supabase.
 * Uso: bun run scripts/check_troca_senha_setup.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.error("[ERRO] VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórios no .env");
  process.exit(1);
}

const anonClient = createClient(url, anon);
const adminClient = service ? createClient(url, service, { auth: { persistSession: false } }) : null;

async function main() {
  console.log("=== Check: troca de senha no 1º acesso ===\n");
  console.log(`Projeto: ${url?.replace("https://", "").split(".")[0] ?? "?"}\n`);

  const client = adminClient ?? anonClient;
  const { data, error } = await client
    .from("usuarios_perfil")
    .select("must_change_password")
    .limit(1);

  if (error) {
    if (error.message.includes("must_change_password") || error.code === "42703") {
      console.log("[PENDENTE] Coluna must_change_password ainda não existe.");
      console.log("           Confirme o projeto slewrhdxxtqcdsnpxxwo no SQL Editor e reaplique a migration.");
      process.exit(2);
    }
    console.error("[ERRO] usuarios_perfil:", error.message, error.code ?? "");
    process.exit(1);
  }

  console.log("[OK] Coluna must_change_password existe.");

  const { error: rpcErr } = await client.rpc("concluir_troca_senha");
  if (rpcErr?.message?.includes("Could not find the function")) {
    console.log("[PENDENTE] RPC concluir_troca_senha não encontrada — aplique a migration.");
    process.exit(2);
  }
  console.log("[OK] RPC concluir_troca_senha registrada.");

  if (!service) {
    console.log("\n[INFO] SUPABASE_SERVICE_ROLE_KEY ausente — pule criação automática de usuário.");
    console.log("       Use Configurações (admin) ou: bun run scripts/test_troca_senha_flow.ts <email> <senha_temp> <nova_senha>");
    return;
  }

  const users = await adminClient!.auth.admin.listUsers({ page: 1, perPage: 5 });
  if (users.error) {
    console.log("\n[AVISO] listUsers:", users.error.message);
  } else {
    console.log(`[OK] Auth acessível (${users.data.users.length} usuários na 1ª página).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
