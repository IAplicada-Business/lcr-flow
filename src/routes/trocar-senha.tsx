import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LcrLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { destinoPosAuth } from "@/lib/auth-redirect";

export const Route = createFileRoute("/trocar-senha")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const destino = await destinoPosAuth();
    if (destino === "/app") throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "LCR Contábil — Definir nova senha" },
      { name: "description", content: "Troca obrigatória de senha no primeiro acesso." },
    ],
  }),
  component: TrocarSenhaPage,
});

function TrocarSenhaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    destinoPosAuth().then((to) => {
      if (to === "/app") navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error("A nova senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    const { error: authErr } = await supabase.auth.updateUser({ password: senha });
    if (authErr) {
      setLoading(false);
      toast.error(authErr.message);
      return;
    }

    const { error: rpcErr } = await supabase.rpc("concluir_troca_senha");
    setLoading(false);
    if (rpcErr) {
      toast.error(rpcErr.message);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["meu-perfil"] });
    toast.success("Senha atualizada. Bem-vindo(a)!");
    navigate({ to: "/app", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <LcrLogo size={72} />
          <div className="mt-8 text-[0.7rem] tracking-[0.22em] uppercase text-muted-foreground">
            Primeiro acesso
          </div>
          <h1 className="mt-3 font-display text-3xl text-foreground tracking-tight">
            Defina sua senha
          </h1>
          <p className="mt-2 text-sm text-soft-foreground">
            Por segurança, troque a senha provisória antes de continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-10">
          <div className="space-y-1.5">
            <Label htmlFor="senha" className="text-xs uppercase tracking-wider text-muted-foreground">
              Nova senha
            </Label>
            <Input
              id="senha"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="h-11 rounded-full px-5"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmacao" className="text-xs uppercase tracking-wider text-muted-foreground">
              Confirmar senha
            </Label>
            <Input
              id="confirmacao"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              className="h-11 rounded-full px-5"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full mt-2 bg-primary text-primary-foreground hover:bg-primary-hover"
          >
            {loading ? "Salvando…" : "Salvar e continuar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
