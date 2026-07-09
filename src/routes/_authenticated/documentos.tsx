import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader, ResumoTela } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Download, Sparkles, Eye, Loader2, ClipboardCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { StatusPill, variantFor } from "@/components/status-pill";
import { listEmpresas, createDocumento, setDocumentoStatus, ensureCompetencia, getDocumentosResumo, listDocumentosPaginado, getDocumentosCompetencias } from "@/lib/lcr.functions";
import { DOC_TIPO_LABEL, DOC_STATUS_LABEL, formatCompetencia, competenciaAtual } from "@/lib/format";
import { documentoComErroProcessamento } from "@/lib/documento-erros";
import { DocumentoErroHint } from "@/components/documento-erro-hint";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { requireAcesso } from "@/lib/guard";

export const Route = createFileRoute("/_authenticated/documentos")({
  beforeLoad: ({ context }) => requireAcesso(context.queryClient, "documentos", "/documentos"),
  head: () => ({ meta: [{ title: "Documentos — LCR Contábil" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["documentos-resumo"], queryFn: () => getDocumentosResumo() }),
      context.queryClient.ensureQueryData({ queryKey: ["documentos-competencias"], queryFn: () => getDocumentosCompetencias() }),
      context.queryClient.ensureQueryData({ queryKey: ["empresas"], queryFn: () => listEmpresas() }),
    ]);
  },
  component: DocsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

function DocsPage() {
  const qc = useQueryClient();
  // KPIs contados no servidor (a lista é paginada). refetch a cada 10s p/ não
  // "congelar" enquanto o pipeline processa documentos.
  const { data: resumo } = useSuspenseQuery({ queryKey: ["documentos-resumo"], queryFn: () => getDocumentosResumo(), refetchInterval: 10000 });
  const { data: competencias } = useSuspenseQuery({ queryKey: ["documentos-competencias"], queryFn: () => getDocumentosCompetencias() });
  const { data: empresas } = useSuspenseQuery({ queryKey: ["empresas"], queryFn: () => listEmpresas() });
  const [empresa, setEmpresa] = useState("all");
  const [tipo, setTipo] = useState("all");
  const [status, setStatus] = useState("all");
  const [competencia, setCompetencia] = useState("all");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [processando, setProcessando] = useState<string | null>(null);
  const [verDados, setVerDados] = useState<{ nome: string; dados: Record<string, unknown> } | null>(null);

  useEffect(() => { setPage(1); }, [empresa, tipo, status, competencia]);

  // Filtros e paginação NO SERVIDOR (varre todos os +13k docs, não só 500).
  const { data: pageData, isFetching } = useQuery({
    queryKey: ["documentos-paginadas", empresa, tipo, status, competencia, page],
    queryFn: () => listDocumentosPaginado({ data: {
      empresa_id: empresa === "all" ? undefined : empresa,
      tipo: tipo === "all" ? undefined : tipo,
      status: status === "all" ? undefined : status,
      competencia: competencia === "all" ? undefined : competencia,
      page, pageSize,
    } }),
    placeholderData: keepPreviousData,
  });
  const items = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function processarIA(id: string) {
    setProcessando(id);
    try {
      const { data, error } = await supabase.functions.invoke("processar-documento", { body: { documento_id: id } });
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.error ?? "Falha ao processar");
      qc.invalidateQueries({ queryKey: ["documentos"] });
      qc.invalidateQueries({ queryKey: ["documentos-paginadas"] });
      qc.invalidateQueries({ queryKey: ["documentos-resumo"] });
      toast.success("Documento processado pela IA.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setProcessando(null);
    }
  }

  function temDados(dados: unknown): dados is Record<string, unknown> {
    return !!dados && typeof dados === "object" && Object.keys(dados as object).length > 0;
  }

  async function baixar(path: string) {
    // gera uma URL assinada temporária (60s) para o arquivo no bucket privado
    const { data, error } = await supabase.storage.from("documentos-clientes").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Não foi possível gerar o link.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function avancarStatus(id: string, atual: string) {
    const ordem = ["recebido", "classificado", "processado", "conciliado"] as const;
    const idx = ordem.indexOf(atual as (typeof ordem)[number]);
    if (idx < 0 || idx === ordem.length - 1) return;
    await setDocumentoStatus({ data: { id, status: ordem[idx + 1] } });
    qc.invalidateQueries({ queryKey: ["documentos"] });
    qc.invalidateQueries({ queryKey: ["documentos-paginadas"] });
    qc.invalidateQueries({ queryKey: ["documentos-resumo"] });
  }

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Documentos recebidos via Gestta ou upload manual."
        actions={
          <>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Upload manual</Button></DialogTrigger>
              <UploadDialog empresas={empresas} onSuccess={() => setOpen(false)} />
            </Dialog>
          </>
        }
      />

      <ResumoTela itens={[
        { label: "Documentos", value: resumo.total },
        { label: "Recebidos", value: resumo.recebido },
        { label: "Classificados", value: resumo.classificado },
        { label: "Processados", value: resumo.processado, tone: "ok" as const },
        { label: "Conciliados", value: resumo.conciliado, tone: "ok" as const },
      ]} />

      <Card className="border-border">
        <div className="space-y-3 border-b border-border p-4">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">Todos</TabsTrigger>
              {Object.entries(DOC_STATUS_LABEL).map(([k, v]) => <TabsTrigger key={k} value={k}>{v}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Select value={competencia} onValueChange={setCompetencia}>
              <SelectTrigger><SelectValue placeholder="Competência" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as competências</SelectItem>
                {competencias.map((c) => <SelectItem key={c} value={c}>{formatCompetencia(c)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={empresa} onValueChange={setEmpresa}>
              <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(DOC_TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="self-center text-sm text-muted-foreground">{total} documento(s){isFetching ? " · atualizando…" : ""}</div>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Recebido em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.empresa?.razao_social}</TableCell>
                <TableCell className="text-sm">{DOC_TIPO_LABEL[d.tipo]}</TableCell>
                <TableCell className="text-sm">{formatCompetencia(d.competencia)}</TableCell>
                <TableCell className="text-xs uppercase text-muted-foreground">{d.origem}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(d.recebido_em).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <span className="flex items-center gap-1.5">
                      {d.duplicata_de && <StatusPill variant="back">Duplicata</StatusPill>}
                      {documentoComErroProcessamento(d) ? (
                        <StatusPill variant="back">Erro IA</StatusPill>
                      ) : (
                        <StatusPill variant={variantFor(d.status)}>{DOC_STATUS_LABEL[d.status]}</StatusPill>
                      )}
                    </span>
                    {documentoComErroProcessamento(d) && (
                      <DocumentoErroHint classificacao_ia={d.classificacao_ia} compact />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {temDados(d.dados_extraidos) && (
                      <Button variant="ghost" size="sm" onClick={() => setVerDados({ nome: d.arquivo_nome ?? d.empresa?.razao_social ?? "Documento", dados: d.dados_extraidos as Record<string, unknown> })} title="Ver dados extraídos">
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {(d.status_processamento === "classificado" || d.status_processamento === "revisado" || d.status_processamento === "erro" || d.duplicata_de) && (
                      <Button variant="ghost" size="sm" asChild title={d.duplicata_de ? "Ver duplicata" : documentoComErroProcessamento(d) ? "Ver falha de processamento" : "Revisar classificação da IA"}>
                        <Link to="/revisar/$documentoId" params={{ documentoId: d.id }}><ClipboardCheck className="h-4 w-4" /></Link>
                      </Button>
                    )}
                    {d.arquivo_url && (
                      <Button variant="ghost" size="sm" disabled={processando === d.id} onClick={() => processarIA(d.id)} title="Processar com IA (Claude)">
                        {processando === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      </Button>
                    )}
                    {d.arquivo_url && (
                      <Button variant="ghost" size="sm" onClick={() => baixar(d.arquivo_url!)} title="Baixar arquivo">
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {d.status !== "conciliado" && (
                      <Button variant="outline" size="sm" onClick={() => avancarStatus(d.id, d.status)}>Avançar</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{isFetching ? "Carregando…" : "Nenhum documento."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <div className="text-muted-foreground">Página {page} de {totalPages} · {total} documento(s)</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!verDados} onOpenChange={(o) => !o && setVerDados(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="font-display text-2xl">Dados extraídos — {verDados?.nome}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Campos identificados pela IA (Claude) a partir do documento.</p>
          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs">{JSON.stringify(verDados?.dados ?? {}, null, 2)}</pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UploadDialog({ empresas, onSuccess }: { empresas: { id: string; razao_social: string }[]; onSuccess: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ empresa_id: "", tipo: "extrato", competencia: competenciaAtual() });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.empresa_id) return toast.error("Selecione o cliente");
    if (!form.competencia.match(/^\d{4}-\d{2}$/)) return toast.error("Competência no formato AAAA-MM");
    if (!file) return toast.error("Selecione um arquivo");
    setLoading(true);
    try {
      // 1) garante a competência e obtém o id
      const { id: competencia_id } = await ensureCompetencia({
        data: { empresa_id: form.empresa_id, competencia: form.competencia },
      });

      // 2) upload real no bucket "documentos-clientes" · path {empresa}/{ano-mes}/auto/{file}
      const path = `${form.empresa_id}/${form.competencia}/auto/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("documentos-clientes")
        .upload(path, file, { upsert: false, cacheControl: "3600" });
      if (upErr) {
        toast.error(upErr.message);
        setLoading(false);
        return;
      }

      // 3) registra o documento (status_processamento = pendente)
      const doc = await createDocumento({
        data: {
          empresa_id: form.empresa_id,
          tipo: form.tipo as "extrato",
          competencia: form.competencia,
          competencia_id,
          arquivo_url: path,
          storage_path: path,
          arquivo_nome: file.name,
          arquivo_tamanho_bytes: file.size,
          mime_type: file.type || "application/pdf",
        },
      });

      qc.invalidateQueries({ queryKey: ["documentos"] });
      qc.invalidateQueries({ queryKey: ["documentos-paginadas"] });
      qc.invalidateQueries({ queryKey: ["documentos-resumo"] });
      qc.invalidateQueries({ queryKey: ["documentos-competencias"] });
      toast.success("Documento enviado. Processando com IA…");
      onSuccess();

      // 4) dispara o processamento IA (best-effort) e atualiza a UI ao concluir
      void supabase.functions.invoke("processar-documento", { body: { documento_id: doc.id } }).then(({ data, error }) => {
        qc.invalidateQueries({ queryKey: ["documentos"] });
        qc.invalidateQueries({ queryKey: ["documentos-paginadas"] });
        qc.invalidateQueries({ queryKey: ["documentos-resumo"] });
        qc.invalidateQueries({ queryKey: ["lancamentos"] });
        const r = data as { ok?: boolean; lancamentos_gerados?: number; error?: string } | null;
        if (error || !r?.ok) toast.error(r?.error ?? "Falha no processamento IA.");
        else toast.success(`IA classificou — ${r.lancamentos_gerados ?? 0} lançamento(s) gerado(s).`);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setLoading(false); }
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display text-2xl">Upload manual</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Select value={form.empresa_id} onValueChange={(v) => setForm({ ...form, empresa_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de documento</Label>
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(DOC_TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Competência</Label><Input value={form.competencia} onChange={(e) => setForm({ ...form, competencia: e.target.value })} placeholder="2026-05" /></div>
          <div className="space-y-1.5">
            <Label>Arquivo</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Enviando..." : "Registrar"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
