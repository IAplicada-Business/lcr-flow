import { supabase } from "@/integrations/supabase/client";

/** Destino após login ou sessão já ativa. */
export async function destinoPosAuth(): Promise<"/trocar-senha" | "/app"> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "/app";

  const { data: perfil } = await supabase
    .from("usuarios_perfil")
    .select("must_change_password")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return perfil?.must_change_password ? "/trocar-senha" : "/app";
}

/** Guarda de rotas autenticadas: exige troca de senha antes do app. */
export async function exigeTrocaSenha(): Promise<boolean> {
  const destino = await destinoPosAuth();
  return destino === "/trocar-senha";
}
