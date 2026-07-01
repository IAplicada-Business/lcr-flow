import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, ResumoTela } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { requireAcesso } from "@/lib/guard";
import { listarLogsRecentes, matrizProdutividade, type LogRow } from "@/lib/logs.functions";
import { Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/gestao/logs")({
  beforeLoad: ({ context }) => requireAcesso(context.queryClient, "gestao:logs", "/gestao/logs"),
  head: () => ({ meta: [{ title: "Logs de uso — Gestão — LCR Contábil" }] }),
  component: LogsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

const ACAO_LABEL: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  viu_cliente: "Abriu cliente",
  aprovou_lancamento: "Aprovou lançamento",
  gerou_sci: "Gerou SCI",
  perguntou_cerebro: "Perguntou ao Cérebro",
  reportou_oportunidade: "Reportou oportunidade",
  abriu_conciliacao: "Abriu conciliação",
  importou_documento: "Importou documento",
};

function LogsPage() {
  const [tab, setTab] = useState<"timeline" | "matriz" | "saude">("timeline");

  const { data: logs = [] } = useQuery({ queryKey: ["logs-uso"], queryFn: () => listarLogsRecentes({ limit: 500 }) });
  const { data: matriz = [] } = useQuery({ queryKey: ["logs-matriz"], queryFn: () => matrizProdutividade(30) });

  const totais = useMemo(() => {
    const acc = { total: logs.length, usuarios: new Set<string>(), clientes: new Set<string>(), cerebro: 0, aprov: 0 };
    for (const l of logs) {
      if (l.user_id) acc.usuarios.add(l.user_id);
      if (l.cliente_id) acc.clientes.add(l.cliente_id);
      if (l.acao === "perguntou_cerebro") acc.cerebro++;
      if (l.acao === "aprovou_lancamento") acc.aprov++;
    }
    return acc;
  }, [logs]);

  function exportarCsv() {
    const rows = [["data", "usuario", "acao", "tela", "cliente", "detalhes"]];
    for (const l of logs) {
      rows.push([
        new Date(l.criado_em).toISOString(),
        l.user_id ?? "",
        l.acao,
        l.tela ?? "",
        l.cliente_id ?? "",
        JSON.stringify(l.detalhes ?? {}),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-uso-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado.");
  }

  return (
    <>
      <PageHeader
        title="Logs de"
        emphasis="uso"
        description="Comportamento do time no sistema — timeline, produtividade e saúde operacional. Fonte: logs_uso (separado de audit_log)."
        actions={<Button size="sm" variant="outline" onClick={exportarCsv}><Download className="mr-1 h-4 w-4" /> Exportar CSV</Button>}
      />

      <ResumoTela itens={[
        { label: "Eventos", value: totais.total },
        { label: "Colaboradores ativos", value: totais.usuarios.size },
        { label: "Clientes tocados", value: totais.clientes.size },
        { label: "Perguntas Cérebro", value: totais.cerebro, tone: "ok" },
        { label: "Aprovações", value: totais.aprov },
      ]} />

      <Card className="rounded-2xl border-0 shadow-soft">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "timeline")}>
          <TabsList className="m-4">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="matriz">Matriz de produtividade</TabsTrigger>
            <TabsTrigger value="saude">Saúde operacional</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="px-0 pb-4">
            <TimelineView logs={logs} />
          </TabsContent>

          <TabsContent value="matriz" className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Colaborador</th>
                    <th className="px-3 py-2 text-right">Clientes</th>
                    <th className="px-3 py-2 text-right">Aprovações</th>
                    <th className="px-3 py-2 text-right">SCIs</th>
                    <th className="px-3 py-2 text-right">Cérebro</th>
                    <th className="px-3 py-2 text-right">Oportunidades</th>
                  </tr>
                </thead>
                <tbody>
                  {matriz.map((r) => (
                    <tr key={r.user_id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{r.nome ?? r.user_id.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-right">{r.clientes_atendidos}</td>
                      <td className="px-3 py-2 text-right">{r.lancamentos_aprovados}</td>
                      <td className="px-3 py-2 text-right">{r.scis_gerados}</td>
                      <td className="px-3 py-2 text-right">{r.cerebro_perguntas}</td>
                      <td className="px-3 py-2 text-right">{r.oportunidades_reportadas}</td>
                    </tr>
                  ))}
                  {matriz.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sem atividade nos últimos 30 dias.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="saude" className="px-4 pb-4">
            <div className="rounded-xl bg-muted/30 p-6 text-sm text-muted-foreground">
              Painel de saúde operacional para Bruno. Métricas: fechamentos atrasados,
              distribuição de carga, tempo médio doc → SCI, oportunidades abertas × resolvidas.
              <div className="mt-2 text-xs italic">Em construção — depende de mais dados de uso agregados.</div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </>
  );
}

function TimelineView({ logs }: { logs: LogRow[] }) {
  const porDia = useMemo(() => {
    const grupos = new Map<string, LogRow[]>();
    for (const l of logs) {
      const dia = l.criado_em.slice(0, 10);
      const g = grupos.get(dia) ?? [];
      g.push(l);
      grupos.set(dia, g);
    }
    return [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  if (porDia.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum evento registrado ainda.</div>;
  }

  return (
    <div className="divide-y divide-border">
      {porDia.map(([dia, itens]) => (
        <div key={dia} className="px-4 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {new Date(dia + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}
          </div>
          <div className="space-y-1">
            {itens.slice(0, 30).map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-xs">
                <span className="w-14 shrink-0 text-muted-foreground">{l.criado_em.slice(11, 16)}</span>
                <span className="rounded-md bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary">{ACAO_LABEL[l.acao] ?? l.acao}</span>
                <span className="truncate text-muted-foreground">{l.tela ?? ""}</span>
              </div>
            ))}
            {itens.length > 30 && <div className="text-[11px] italic text-muted-foreground">+{itens.length - 30} eventos</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
