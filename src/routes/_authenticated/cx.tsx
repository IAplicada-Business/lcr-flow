import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader, ResumoTela } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCxCarteira } from "@/lib/lcr.functions";
import { requireAcesso } from "@/lib/guard";
import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/cx")({
  beforeLoad: ({ context }) => requireAcesso(context.queryClient, "cx", "/cx"),
  head: () => ({ meta: [{ title: "CX · Experiência — LCR Contábil" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ["cx-carteira"], queryFn: () => getCxCarteira() }),
  component: CxPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

const CORES = { saudavel: "#10b981", atencao: "#f59e0b", risco: "#f43f5e" };
const fmtPeriodo = (p: string) => p.slice(0, 7);
function TendIcon({ t }: { t: string | null }) {
  if (t === "subindo") return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (t === "caindo") return <TrendingDown className="h-3.5 w-3.5 text-rose-600" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function CxPage() {
  const { data } = useSuspenseQuery({ queryKey: ["cx-carteira"], queryFn: () => getCxCarteira() });
  const pieData = [
    { name: "Saudável", key: "saudavel", value: data.dist.saudavel },
    { name: "Atenção", key: "atencao", value: data.dist.atencao },
    { name: "Risco", key: "risco", value: data.dist.risco },
  ];

  return (
    <>
      <PageHeader title="CX ·" emphasis="Experiência" description="Saúde do relacionamento da carteira. Fale com o Cuidador no assistente para ações de relacionamento." />

      <ResumoTela itens={[
        { label: "Health médio", value: data.mediaHealth },
        { label: "Saudáveis", value: data.dist.saudavel, tone: "ok" as const },
        { label: "Em atenção", value: data.dist.atencao },
        { label: "Em risco", value: data.dist.risco, tone: "warn" as const },
        { label: "Clientes", value: data.total },
      ]} />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 font-display text-lg">Distribuição da carteira</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {pieData.map((d) => <Cell key={d.key} fill={CORES[d.key as keyof typeof CORES]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex justify-center gap-4 text-xs">
            {pieData.map((d) => <span key={d.key} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CORES[d.key as keyof typeof CORES] }} /> {d.name} ({d.value})</span>)}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 font-display text-lg">NPS da carteira (últimos períodos)</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.npsTrend.map((t) => ({ ...t, periodo: fmtPeriodo(t.periodo) }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="periodo" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="nps" name="NPS" stroke="#2563eb" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <h2 className="mb-3 font-display text-xl">Clientes precisando de atenção</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {data.atencao.map((c) => (
          <Link key={c.id} to="/cx/$empresaId" params={{ empresaId: c.id }}>
            <Card className="group p-4 transition-colors hover:border-primary/50">
              <div className="flex items-center justify-between">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium",
                  c.classificacao === "risco" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{c.classificacao}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><TendIcon t={c.tendencia} /> {c.tendencia}</span>
              </div>
              <div className="mt-2 font-medium">{c.nome}</div>
              <div className="mt-1 flex items-end justify-between">
                <span className="font-display text-2xl">{c.score}<span className="text-sm text-muted-foreground">/100</span></span>
                <span className="flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">Ver <ArrowRight className="h-3 w-3" /></span>
              </div>
            </Card>
          </Link>
        ))}
        {data.atencao.length === 0 && <div className="text-sm text-muted-foreground">Nenhum cliente em atenção. 🎉</div>}
      </div>
    </>
  );
}
