/**
 * Teste E2E do fluxo de troca de senha (sem UI).
 * Uso: bun run scripts/test_troca_senha_flow.ts <email> <senha_provisoria> <nova_senha>
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

const [email, tempPass, newPass] = process.argv.slice(2);

if (!url || !anon) {
  console.error("Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env");
  process.exit(1);
}

if (!email || !tempPass || !newPass) {
  console.error("Uso: bun run scripts/test_troca_senha_flow.ts <email> <senha_provisoria> <nova_senha>");
  process.exit(1);
}

const client = createClient(url, anon);

async function step(label: string, fn: () => Promise<void>) {
  process.stdout.write(`→ ${label}... `);
  try {
    await fn();
    console.log("OK");
  } catch (e) {
    console.log("FALHOU");
    throw e;
  }
}

async function main() {
  console.log("=== Teste fluxo troca de senha (API) ===\n");

  await step("Login com senha provisória", async () => {
    const { error } = await client.auth.signInWithPassword({ email, password: tempPass });
    if (error) throw new Error(error.message);
  });

  let mustChange = false;
  await step("Ler must_change_password", async () => {
    const { data: user } = await client.auth.getUser();
    const { data, error } = await client
      .from("usuarios_perfil")
      .select("must_change_password")
      .eq("user_id", user.user!.id)
      .single();
    if (error) throw new Error(error.message);
    mustChange = !!data?.must_change_password;
    if (!mustChange) throw new Error("esperado must_change_password=true antes da troca");
  });

  await step("Atualizar senha (updateUser)", async () => {
    const { error } = await client.auth.updateUser({ password: newPass });
    if (error) throw new Error(error.message);
  });

  await step("RPC concluir_troca_senha", async () => {
    const { error } = await client.rpc("concluir_troca_senha");
    if (error) throw new Error(error.message);
  });

  await step("Confirmar flag liberada", async () => {
    const { data: user } = await client.auth.getUser();
    const { data, error } = await client
      .from("usuarios_perfil")
      .select("must_change_password")
      .eq("user_id", user.user!.id)
      .single();
    if (error) throw new Error(error.message);
    if (data?.must_change_password) throw new Error("flag ainda true após RPC");
  });

  await client.auth.signOut();
  console.log("\n✓ Fluxo completo validado. Próximo login usa a nova senha.");
}

main().catch((e) => {
  console.error("\n", e instanceof Error ? e.message : e);
  process.exit(1);
});
