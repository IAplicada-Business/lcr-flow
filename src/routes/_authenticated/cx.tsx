import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader, ResumoTela } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCxCarteira } from "@/lib/lcr.functions";
import { requireAcesso } from "@/lib/guard";
import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

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
  const totalNps = data.npsResumo.promotores + data.npsResumo.neutros + data.npsResumo.detratores;
  const pctNps = (n: number) => (totalNps ? (n / totalNps) * 100 : 0);

  return (
    <>
      <PageHeader title="CX ·" emphasis="Experiência" description="Saúde do relacionamento da carteira. Fale com o Cuidador no assistente para ações de relacionamento." />

      <ResumoTela itens={[
        { label: "Health médio", value: data.mediaHealth },
        { label: "NPS atual", value: data.npsResumo.npsAtual, tone: data.npsResumo.npsAtual >= 0 ? "ok" as const : "warn" as const },
        { label: "Saudáveis", value: data.dist.saudavel, tone: "ok" as const },
        { label: "Em atenção", value: data.dist.atencao },
        { label: "Em risco", value: data.dist.risco, tone: "warn" as const },
      ]} />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="label-cat">Composição do NPS · último período</div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${pctNps(data.npsResumo.promotores)}%` }} />
            <div className="bg-amber-400" style={{ width: `${pctNps(data.npsResumo.neutros)}%` }} />
            <div className="bg-rose-500" style={{ width: `${pctNps(data.npsResumo.detratores)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span className="text-emerald-600">{data.npsResumo.promotores} promotores</span>
            <span>{data.npsResumo.neutros} neutros</span>
            <span className="text-rose-600">{data.npsResumo.detratores} detratores</span>
          </div>
        </Card>
        <Card className="flex items-center justify-between p-4">
          <div><div className="label-cat">Carteira subindo</div><div className="mt-1 font-display text-3xl text-emerald-600">{data.subindo}</div></div>
          <TrendingUp className="h-6 w-6 text-emerald-500" />
        </Card>
        <Card className="flex items-center justify-between p-4">
          <div><div className="label-cat">Carteira caindo</div><div className="mt-1 font-display text-3xl text-rose-600">{data.caindo}</div></div>
          <TrendingDown className="h-6 w-6 text-rose-500" />
        </Card>
      </div>

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
              <AreaChart data={data.npsTrend.map((t) => ({ ...t, periodo: fmtPeriodo(t.periodo) }))}>
                <defs>
                  <linearGradient id="npsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="periodo" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={28} />
                <Tooltip />
                <Area type="monotone" dataKey="nps" name="NPS" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#npsFill)" dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <h2 className="mb-3 font-display text-xl">Clientes precisando de atenção</h2>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-32">Classificação</TableHead>
              <TableHead className="w-24 text-center">Score</TableHead>
              <TableHead className="w-32">Tendência</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.atencao.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium",
                    c.classificacao === "risco" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{c.classificacao}</span>
                </TableCell>
                <TableCell className="text-center font-mono text-sm">{c.score}<span className="text-muted-foreground">/100</span></TableCell>
                <TableCell>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><TendIcon t={c.tendencia} /> {c.tendencia}</span>
                </TableCell>
                <TableCell className="text-right">
                  <Link to="/cx/$empresaId" params={{ empresaId: c.id }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Ver <ArrowRight className="h-3 w-3" /></Link>
                </TableCell>
              </TableRow>
            ))}
            {data.atencao.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum cliente em atenção. 🎉</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
