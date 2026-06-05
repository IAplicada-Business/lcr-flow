import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, DemoFlag } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, variantFor } from "@/components/status-pill";
import { listLancamentosAgrupados, gerarPlanilhaSci } from "@/lib/lcr.functions";
import { formatCompetencia, LANCAMENTO_STATUS_LABEL } from "@/lib/format";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [{ title: "Lançamentos — LCR Contábil" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ["lancamentos"], queryFn: () => listLancamentosAgrupados() }),
  component: LancamentosPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

function LancamentosPage() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({ queryKey: ["lancamentos"], queryFn: () => listLancamentosAgrupados() });
  const [preview, setPreview] = useState<{ empresa: string } | null>(null);

  async function gerar(empresaId: string, empresaNome: string) {
    try {
      await gerarPlanilhaSci({ data: { empresa_id: empresaId, competencia: data.competencia } });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success("Planilha SCI gerada.");
      setPreview({ empresa: empresaNome });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <>
      <PageHeader title="Lançamentos contábeis" description={`Competência ${formatCompetencia(data.competencia)} — geração de planilhas SCI.`} actions={<DemoFlag />} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {data.grupos.map((g) => (
          <Card key={g.id} className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">{g.razao_social}</div>
                  <div className="mt-1 text-sm text-soft-foreground">{g.prontos} documento(s) prontos</div>
                </div>
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </div>
              <Button className="w-full mt-4" disabled={g.prontos === 0} onClick={() => gerar(g.id, g.razao_social)}>
                Gerar planilha SCI
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="font-display text-xl mb-3">Histórico de planilhas</h2>
      <Card className="border-border">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Cliente</TableHead><TableHead>Competência</TableHead><TableHead>Lançamentos</TableHead><TableHead>Status</TableHead><TableHead>Gerada em</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.historico.map((h) => {
              const emp = data.grupos.find((g) => g.id === h.empresa_id);
              return (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{emp?.razao_social ?? "—"}</TableCell>
                  <TableCell>{formatCompetencia(h.competencia)}</TableCell>
                  <TableCell>{h.total_lancamentos}</TableCell>
                  <TableCell><StatusPill variant={variantFor(h.status)}>{LANCAMENTO_STATUS_LABEL[h.status]}</StatusPill></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              );
            })}
            {data.historico.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma planilha gerada.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle className="font-display text-2xl">Preview — {preview?.empresa}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Pré-visualização do conteúdo da planilha SCI gerada (mockup).</p>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Histórico</TableHead><TableHead>Débito</TableHead><TableHead>Crédito</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {[
                ["02/05", "Recebimento cliente A", "1.1.01", "3.1.01", "1.250,00"],
                ["05/05", "Pagamento fornecedor B", "4.1.02", "1.1.01", "890,40"],
                ["08/05", "Tarifa bancária", "4.3.01", "1.1.01", "32,50"],
                ["12/05", "Recebimento cliente C", "1.1.01", "3.1.01", "4.700,00"],
                ["15/05", "DARF Simples Nacional", "4.4.01", "1.1.01", "612,30"],
              ].map((row, i) => (
                <TableRow key={i}>{row.map((c, j) => <TableCell key={j} className={j === 4 ? "text-right font-mono" : ""}>{c}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </>
  );
}
