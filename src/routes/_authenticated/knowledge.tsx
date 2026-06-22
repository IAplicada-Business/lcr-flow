import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, ResumoTela } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getKnowledgeHub } from "@/lib/lcr.functions";
import { requireAcesso } from "@/lib/guard";
import { Search, BookOpen, Video, FileText, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/knowledge")({
  beforeLoad: ({ context }) => requireAcesso(context.queryClient, "knowledge", "/knowledge"),
  head: () => ({ meta: [{ title: "Base de Conhecimento — LCR Contábil" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ["knowledge-hub"], queryFn: () => getKnowledgeHub() }),
  component: KnowledgePage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

const fmtDur = (s: number | null) => (s ? `${Math.round(s / 60)} min` : "");

function KnowledgePage() {
  const { data } = useSuspenseQuery({ queryKey: ["knowledge-hub"], queryFn: () => getKnowledgeHub() });
  const [q, setQ] = useState("");

  const processos = useMemo(() => data.processos.filter((p) =>
    !q || p.nome.toLowerCase().includes(q.toLowerCase()) || p.codigo.toLowerCase().includes(q.toLowerCase()) || (p.descricao ?? "").toLowerCase().includes(q.toLowerCase())
  ), [data.processos, q]);
  const artigos = useMemo(() => data.artigos.filter((a) => !q || a.titulo.toLowerCase().includes(q.toLowerCase())), [data.artigos, q]);

  return (
    <>
      <PageHeader title="Base de" emphasis="Conhecimento" description="Processos, padrões e procedimentos da LCR. Pergunte ao Mestre no assistente (canto inferior direito)." />

      <ResumoTela itens={[
        { label: "Processos", value: data.processos.length },
        { label: "Áreas", value: data.areas.length },
        { label: "Artigos", value: data.artigos.length, tone: "ok" as const },
        { label: "Vídeos", value: data.videos.length },
      ]} />

      <div className="relative mb-6 max-w-xl">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar processo ou artigo" className="pl-8" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.areas.map((a) => (
          <Card key={a.area} className="p-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{a.area}</div>
            <div className="mt-1 font-display text-2xl">{a.total}</div>
            <div className="text-xs text-muted-foreground">processo(s)</div>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 flex items-center gap-2 font-display text-xl"><BookOpen className="h-5 w-5 text-primary" /> Processos</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {processos.map((p) => (
          <Link key={p.id} to="/knowledge/processo/$codigo" params={{ codigo: p.codigo }}>
            <Card className="group h-full p-4 transition-colors hover:border-primary/50">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{p.codigo}</Badge>
                <span className="text-[11px] text-muted-foreground">{p.area}</span>
              </div>
              <div className="mt-2 font-medium">{p.nome}</div>
              <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.descricao}</div>
              <div className="mt-3 flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">Abrir <ArrowRight className="h-3 w-3" /></div>
            </Card>
          </Link>
        ))}
        {processos.length === 0 && <div className="text-sm text-muted-foreground">Nenhum processo encontrado.</div>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-display text-xl"><FileText className="h-5 w-5 text-primary" /> Artigos recentes</h2>
          <Card className="divide-y divide-border">
            {artigos.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{a.titulo}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">{(a.tags ?? []).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</div>
                </div>
                {a.categoria && <Badge variant="secondary" className="shrink-0">{a.categoria}</Badge>}
              </div>
            ))}
            {artigos.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum artigo.</div>}
          </Card>
        </div>
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-display text-xl"><Video className="h-5 w-5 text-primary" /> Vídeos em destaque</h2>
          <Card className="divide-y divide-border">
            {data.videos.map((v) => (
              <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Video className="h-4 w-4" /></div>
                  <div className="text-sm font-medium">{v.titulo}</div>
                </div>
                <span className="text-xs text-muted-foreground">{fmtDur(v.duracao_segundos)}</span>
              </a>
            ))}
            {data.videos.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum vídeo.</div>}
          </Card>
        </div>
      </div>
    </>
  );
}
