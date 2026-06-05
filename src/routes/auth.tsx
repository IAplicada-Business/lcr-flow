import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LcrLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "LCR Contábil — Entrar" },
      { name: "description", content: "Plataforma interna LCR Contábil — Integração e Conciliação Bancária." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/app", replace: true });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-deep">
      {/* Painel esquerdo — escuro, editorial */}
      <div className="hidden lg:flex flex-col justify-between bg-deep text-deep-foreground p-14 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, var(--color-deep-foreground) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative font-display text-xl tracking-tight">
          <span>LCR</span>
          <span className="italic text-accent-lime ml-1.5">Contábil</span>
        </div>

        <div className="relative max-w-xl">
          <div className="text-[0.7rem] tracking-[0.22em] uppercase text-accent-lime mb-6">
            Plataforma interna · LCR
          </div>
          <h2 className="font-display text-5xl leading-[1.05] tracking-tight">
            Steget före <span className="italic text-accent-lime">em cada</span> conciliação bancária.
          </h2>
          <p className="mt-8 text-deep-foreground/65 text-base leading-relaxed max-w-md">
            Cobrança de documentos, lançamentos contábeis e conciliação — um único fluxo para a equipe LCR servir cada cliente com precisão.
          </p>
        </div>

        <div className="relative text-xs text-deep-foreground/40">
          © {new Date().getFullYear()} LCR Contábil
        </div>
      </div>

      {/* Painel direito — claro, formulário */}
      <div className="flex items-center justify-center p-8 bg-background min-h-screen">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center">
            <LcrLogo size={64} />
            <div className="mt-6 text-[0.7rem] tracking-[0.22em] uppercase text-muted-foreground">
              Acesso restrito
            </div>
            <h1 className="mt-3 font-display text-4xl text-foreground tracking-tight">
              Bem-vindo
            </h1>
            <p className="mt-2 text-sm text-soft-foreground">
              Entre com sua conta da equipe LCR.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 mt-10">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-full px-5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-full px-5"
              />
            </div>
            <Button
              type="submit"
              variant="gold"
              size="lg"
              disabled={loading}
              className="w-full mt-2"
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Contas são provisionadas internamente pela administração LCR.
          </p>
        </div>
      </div>
    </div>
  );
}
