import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, ResumoTela } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getKnowledgeHub } from "@/lib/lcr.functions";
import { requireAcesso } from "@/lib/guard";
import { Search, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/knowledge")({
  beforeLoad: ({ context }) => requireAcesso(context.queryClient, "knowledge", "/knowledge"),
  head: () => ({ meta: [{ title: "Base de Conhecimento — LCR Contábil" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ["knowledge-hub"], queryFn: () => getKnowledgeHub() }),
  component: KnowledgePage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

function KnowledgePage() {
  const { data } = useSuspenseQuery({ queryKey: ["knowledge-hub"], queryFn: () => getKnowledgeHub() });
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");

  const processos = useMemo(() => data.processos.filter((p) => {
    if (area !== "all" && p.area !== area) return false;
    if (q && !(`${p.codigo} ${p.nome} ${p.descricao ?? ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [data.processos, q, area]);

  return (
    <>
      <PageHeader title="Base de" emphasis="Conhecimento" description="Processos, padrões e procedimentos da LCR. Pergunte ao Mestre no assistente (canto inferior direito)." />

      <ResumoTela itens={[
        { label: "Processos", value: data.processos.length },
        { label: "Áreas", value: data.areas.length },
        { label: "Artigos", value: data.artigos.length, tone: "ok" as const },
      ]} />

      <Card>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar processo" className="pl-8" />
          </div>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as áreas</SelectItem>
              {data.areas.map((a) => <SelectItem key={a.area} value={a.area}>{a.area} ({a.total})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Código</TableHead>
              <TableHead>Processo</TableHead>
              <TableHead className="w-36">Área</TableHead>
              <TableHead className="w-20 text-center">Passos</TableHead>
              <TableHead className="w-20 text-center">Artigos</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processos.map((p) => (
              <TableRow key={p.id}>
                <TableCell><Badge variant="secondary">{p.codigo}</Badge></TableCell>
                <TableCell>
                  <div className="font-medium">{p.nome}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{p.descricao}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.area}</TableCell>
                <TableCell className="text-center text-sm">{p.passos}</TableCell>
                <TableCell className="text-center text-sm">{p.artigos}</TableCell>
                <TableCell className="text-right">
                  <Link to="/knowledge/processo/$codigo" params={{ codigo: p.codigo }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    Abrir <ArrowRight className="h-3 w-3" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {processos.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum processo encontrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
