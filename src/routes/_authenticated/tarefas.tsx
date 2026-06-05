import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, DemoFlag } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DndContext, useDraggable, useDroppable, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { listTarefas, listConsultores, moverTarefa } from "@/lib/lcr.functions";
import { TAREFA_TIPO_LABEL } from "@/lib/format";
import { StatusPill } from "@/components/status-pill";
import { Calendar, User } from "lucide-react";
import { toast } from "sonner";

type TarefaStatus = "now" | "doing" | "next" | "back" | "done";

const COLUNAS: { key: TarefaStatus; label: string; variant: "now" | "doing" | "next" | "back" | "neutral" }[] = [
  { key: "now", label: "Em foco", variant: "now" },
  { key: "doing", label: "Em andamento", variant: "doing" },
  { key: "next", label: "Próximas", variant: "next" },
  { key: "back", label: "Atrasadas / revisar", variant: "back" },
];

const TIPOS: { key: "cobranca" | "lancamentos" | "conciliacao"; label: string }[] = [
  { key: "cobranca", label: TAREFA_TIPO_LABEL.cobranca },
  { key: "lancamentos", label: TAREFA_TIPO_LABEL.lancamentos },
  { key: "conciliacao", label: TAREFA_TIPO_LABEL.conciliacao },
];

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas — LCR Contábil" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["tarefas"], queryFn: () => listTarefas() }),
      context.queryClient.ensureQueryData({ queryKey: ["consultores"], queryFn: () => listConsultores() }),
    ]);
  },
  component: TarefasPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

function TarefasPage() {
  const qc = useQueryClient();
  const { data: tarefas } = useSuspenseQuery({ queryKey: ["tarefas"], queryFn: () => listTarefas() });
  const { data: consultores } = useSuspenseQuery({ queryKey: ["consultores"], queryFn: () => listConsultores() });
  const [consultorFiltro, setConsultorFiltro] = useState("all");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const filtered = useMemo(() => tarefas.filter((t) => consultorFiltro === "all" || t.consultor?.id === consultorFiltro), [tarefas, consultorFiltro]);

  async function handleDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const newStatus = e.over?.id ? String(e.over.id).split(":")[1] : null;
    if (!newStatus) return;
    const t = tarefas.find((x) => x.id === id);
    if (!t || t.status === newStatus) return;
    try {
      await moverTarefa({ data: { id, status: newStatus as TarefaStatus } });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Espelho do Gestta — fluxo mensal de cobrança, lançamentos e conciliação."
        actions={
          <>
            <DemoFlag />
            <Select value={consultorFiltro} onValueChange={setConsultorFiltro}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Consultor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os consultores</SelectItem>
                {consultores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="space-y-8">
          {TIPOS.map((tipo) => (
            <section key={tipo.key}>
              <h2 className="font-display text-xl mb-3">{tipo.label}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {COLUNAS.map((col) => {
                  const items = filtered.filter((t) => t.tipo === tipo.key && t.status === col.key);
                  return <Coluna key={col.key} colKey={`${tipo.key}:${col.key}`} label={col.label} variant={col.variant} items={items} />;
                })}
              </div>
            </section>
          ))}
        </div>
      </DndContext>
    </>
  );
}

function Coluna({ colKey, label, variant, items }: { colKey: string; label: string; variant: "now" | "doing" | "next" | "back" | "neutral"; items: { id: string; titulo: string; prazo: string | null; empresa: { razao_social: string } | null; consultor: { nome: string } | null }[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey });
  return (
    <div ref={setNodeRef} className={`rounded-md border border-border bg-card p-3 min-h-32 ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <StatusPill variant={variant}>{label}</StatusPill>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((t) => <CardTarefa key={t.id} t={t} />)}
        {items.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">—</div>}
      </div>
    </div>
  );
}

function CardTarefa({ t }: { t: { id: string; titulo: string; prazo: string | null; empresa: { razao_social: string } | null; consultor: { nome: string } | null } }) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: t.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border border-border bg-background p-2.5 text-sm cursor-grab active:cursor-grabbing ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="font-medium text-foreground line-clamp-2">{t.titulo}</div>
      <div className="text-xs text-muted-foreground mt-1 truncate">{t.empresa?.razao_social}</div>
      <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-muted-foreground">
        {t.prazo ? <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(t.prazo).toLocaleDateString("pt-BR")}</span> : <span />}
        {t.consultor ? <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{t.consultor.nome.split(" ")[0]}</span> : null}
      </div>
    </div>
  );
}
