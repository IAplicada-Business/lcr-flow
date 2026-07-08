import { supabase } from "@/integrations/supabase/client";

export type DestinoPosAuth = "/trocar-senha" | "/app" | "/clientes";

/** Destino após login ou sessão já ativa. */
export async function destinoPosAuth(): Promise<DestinoPosAuth> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "/app";

  const { data: perfil } = await supabase
    .from("usuarios_perfil")
    .select("perfil, must_change_password, permissoes_custom")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (perfil?.must_change_password) return "/trocar-senha";

  if (perfil?.perfil === "assistente") {
    const custom = perfil.permissoes_custom;
    if (!custom || custom.includes("clientes")) return "/clientes";
  }

  return "/app";
}

/** Guarda de rotas autenticadas: exige troca de senha antes do app. */
export async function exigeTrocaSenha(): Promise<boolean> {
  const destino = await destinoPosAuth();
  return destino === "/trocar-senha";
}
