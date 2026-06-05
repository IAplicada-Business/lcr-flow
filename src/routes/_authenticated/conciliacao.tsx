import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader, DemoFlag } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, variantFor } from "@/components/status-pill";
import { listConciliacoes } from "@/lib/lcr.functions";
import { CONCILIACAO_STATUS_LABEL, formatCompetencia } from "@/lib/format";
import { Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/conciliacao")({
  head: () => ({ meta: [{ title: "Conciliação — LCR Contábil" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ["conciliacoes"], queryFn: () => listConciliacoes() }),
  component: ConciliacaoPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

function ConciliacaoPage() {
  const { data } = useSuspenseQuery({ queryKey: ["conciliacoes"], queryFn: () => listConciliacoes() });

  return (
    <>
      <PageHeader
        title="Conciliação bancária"
        description={`Status das conciliações da competência ${formatCompetencia(data.competencia)}.`}
        actions={
          <>
            <DemoFlag />
            <Button variant="outline" onClick={() => toast("Importação CSV mockada — integração real em breve.")}><Upload className="h-4 w-4 mr-1" />Importar razão CSV</Button>
          </>
        }
      />

      <Card className="border-border">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Cliente</TableHead><TableHead>Competência</TableHead><TableHead>Status</TableHead><TableHead>Divergências</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.empresas.map((e) => {
              const conc = e.conciliacoes.find((c) => c.competencia === data.competencia) ?? e.conciliacoes[0];
              const status = conc?.status ?? "nao_iniciada";
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.razao_social}</TableCell>
                  <TableCell>{conc ? formatCompetencia(conc.competencia) : "—"}</TableCell>
                  <TableCell><StatusPill variant={variantFor(status)}>{CONCILIACAO_STATUS_LABEL[status]}</StatusPill></TableCell>
                  <TableCell>{conc?.divergencias_count ?? 0}</TableCell>
                  <TableCell>
                    <Link to="/conciliacao/$empresaId" params={{ empresaId: e.id }}>
                      <Button variant="outline" size="sm">Conciliar</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
