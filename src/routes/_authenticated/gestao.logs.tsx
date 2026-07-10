import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { requireAcesso } from "@/lib/guard";
import { analiseUso, fmtDuracao, telaLabel, ACAO_LABEL, type AnaliseUsuario } from "@/lib/logs.functions";
import { getHistoricoCerebro } from "@/lib/lcr.functions";
import { Download, Users, Activity, Brain, Timer, ChevronRight, Clock, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/gestao/logs")({
  beforeLoad: ({ context }) => requireAcesso(context.queryClient, "gestao:logs", "/gestao/logs"),
  head: () => ({ meta: [{ title: "Logs de uso — Gestão — LCR Contábil" }] }),
  component: LogsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

const fmtDataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtHora = (iso: string) => iso.slice(11, 16);

function LogsPage() {
  const [dias, setDias] = useState(30);
  const [sel, setSel] = useState<AnaliseUsuario | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["analise-uso", dias],
    queryFn: () => analiseUso(dias),
    staleTime: 60_000,
  });
  const { data: cerebro } = useQuery({
    queryKey: ["historico-cerebro", "all", "all"],
    queryFn: () => getHistoricoCerebro({ data: {} }),
    staleTime: 60_000,
  });

  const usuarios = data?.usuarios ?? [];

  function exportarCsv() {
    const rows = [["colaborador", "perfil", "ultimo_acesso", "sessoes", "tempo_total_min", "eventos", "clientes", "perguntas_cerebro", "top_tela", "pct_top_tela"]];
    for (const u of usuarios) {
      rows.push([
        u.nome, u.perfil ?? "", u.ultimo_acesso ?? "", String(u.sessoes.length),
        String(Math.round(u.tempo_total_ms / 60000)), String(u.eventos),
        String(u.clientes_tocados), String(u.cerebro_perguntas),
        u.tempo_por_tela[0]?.tela ?? "", String(u.tempo_por_tela[0]?.pct ?? 0),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `uso-equipe-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado.");
  }

  return (
    <>
      <PageHeader
        title="Logs de"
        emphasis="uso"
        description="Quem acessou, o que fez, onde passou o tempo e o que perguntou ao Cérebro. Sessão = eventos com até 30min de intervalo; o tempo por tela é estimado pela navegação."
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={exportarCsv}><Download className="mr-1 h-4 w-4" /> CSV</Button>
          </div>
        }
      />

      {/* HERO — resumo do período */}
      <div className="mb-6 relative overflow-hidden rounded-3xl bg-deep p-7 text-primary-foreground">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-accent-lime/20 blur-3xl" />
        <div className="relative grid grid-cols-2 gap-6 md:grid-cols-4">
          <HeroStat icon={Users} label="Ativos hoje" value={String(data?.ativos_hoje ?? 0)} sub={`${usuarios.length} no período`} />
          <HeroStat icon={Timer} label="Tempo de uso" value={fmtDuracao(data?.tempo_total_ms ?? 0)} sub="soma da equipe" />
          <HeroStat icon={Activity} label="Eventos" value={String(data?.total_eventos ?? 0)} sub="ações registradas" />
          <HeroStat icon={Brain} label="Cérebro" value={String(data?.perguntas_cerebro ?? 0)} sub="perguntas feitas" />
        </div>
      </div>

      <Tabs defaultValue="pessoas">
        <TabsList className="mb-4">
          <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
          <TabsTrigger value="atividade">Atividade</TabsTrigger>
          <TabsTrigger value="cerebro">Cérebro</TabsTrigger>
          <TabsTrigger value="produtividade">Produtividade</TabsTrigger>
        </TabsList>

        {/* ── PESSOAS: um card por colaborador, clique abre a trilha completa ── */}
        <TabsContent value="pessoas">
          {isLoading && <div className="py-16 text-center text-sm text-muted-foreground">Carregando…</div>}
          {!isLoading && usuarios.length === 0 && (
            <Card className="rounded-3xl border-0 p-10 text-center text-sm text-muted-foreground shadow-soft">
              Nenhum evento no período. A trilha de navegação começou a ser registrada agora — os dados aparecem conforme a equipe usa o sistema.
            </Card>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {usuarios.map((u) => (
              <button key={u.user_id} onClick={() => setSel(u)} className="group text-left">
                <Card className="rounded-3xl border-0 p-5 shadow-soft transition-all group-hover:-translate-y-0.5 group-hover:shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 font-display text-base font-bold text-primary">
                        {u.nome.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="font-medium">{u.nome}</div>
                        <div className="text-xs capitalize text-muted-foreground">{u.perfil ?? "—"} · último acesso {u.ultimo_acesso ? fmtDataHora(u.ultimo_acesso) : "—"}</div>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    <MiniStat label="Tempo" value={fmtDuracao(u.tempo_total_ms)} />
                    <MiniStat label="Sessões" value={String(u.sessoes.length)} />
                    <MiniStat label="Clientes" value={String(u.clientes_tocados)} />
                    <MiniStat label="Cérebro" value={String(u.cerebro_perguntas)} />
                  </div>

                  {/* distribuição % por tela — top 4 */}
                  <div className="mt-4 space-y-1.5">
                    {u.tempo_por_tela.slice(0, 4).map((t) => (
                      <div key={t.tela} className="flex items-center gap-2 text-xs">
                        <span className="w-32 shrink-0 truncate text-muted-foreground">{t.tela}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${t.pct}%` }} />
                        </div>
                        <span className="w-9 text-right font-medium">{t.pct}%</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </TabsContent>

        {/* ── ATIVIDADE: timeline global com nomes ── */}
        <TabsContent value="atividade">
          <Card className="rounded-3xl border-0 shadow-soft">
            <TimelineGlobal usuarios={usuarios} />
          </Card>
        </TabsContent>

        {/* ── CÉREBRO: o que cada pessoa mandou ── */}
        <TabsContent value="cerebro">
          <Card className="rounded-3xl border-0 shadow-soft">
            <div className="divide-y divide-border">
              {(cerebro?.items ?? []).map((it) => (
                <details key={it.id} className="group px-5 py-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Badge variant="secondary" className="capitalize">{it.persona}</Badge>
                      <span className="text-sm font-medium">{it.consultor}</span>
                      {it.cliente && <span className="text-xs text-muted-foreground">· {it.cliente}</span>}
                      <span className="ml-auto text-xs text-muted-foreground">{it.created_at ? fmtDataHora(String(it.created_at)) : ""}</span>
                    </div>
                    <div className="mt-1 text-sm">{it.pergunta}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground group-open:hidden">{it.resposta}</div>
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/40 px-3 py-2 text-xs text-foreground">{it.resposta}</div>
                </details>
              ))}
              {(cerebro?.items ?? []).length === 0 && (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma interação com o Cérebro ainda.</div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* ── PRODUTIVIDADE: matriz + tempo por processo ── */}
        <TabsContent value="produtividade">
          <Card className="rounded-3xl border-0 shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Colaborador</th>
                    <th className="px-3 py-2.5 text-right">Tempo total</th>
                    <th className="px-3 py-2.5 text-right">Sessões</th>
                    <th className="px-3 py-2.5 text-right">Média/sessão</th>
                    <th className="px-3 py-2.5 text-right">Clientes</th>
                    <th className="px-3 py-2.5 text-right">Aprovações</th>
                    <th className="px-3 py-2.5 text-right">SCIs</th>
                    <th className="px-3 py-2.5 text-right">Cérebro</th>
                    <th className="px-3 py-2.5 text-right">Oportunidades</th>
                    <th className="px-4 py-2.5 text-left">Tela principal</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.user_id} className="border-t border-border hover:bg-accent/10">
                      <td className="px-4 py-2.5 font-medium">{u.nome}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{fmtDuracao(u.tempo_total_ms)}</td>
                      <td className="px-3 py-2.5 text-right">{u.sessoes.length}</td>
                      <td className="px-3 py-2.5 text-right">{u.sessoes.length ? fmtDuracao(u.tempo_total_ms / u.sessoes.length) : "—"}</td>
                      <td className="px-3 py-2.5 text-right">{u.clientes_tocados}</td>
                      <td className="px-3 py-2.5 text-right">{u.acoes["aprovou_lancamento"] ?? 0}</td>
                      <td className="px-3 py-2.5 text-right">{u.acoes["gerou_sci"] ?? 0}</td>
                      <td className="px-3 py-2.5 text-right">{u.cerebro_perguntas}</td>
                      <td className="px-3 py-2.5 text-right">{u.acoes["reportou_oportunidade"] ?? 0}</td>
                      <td className="px-4 py-2.5">
                        {u.tempo_por_tela[0] ? (
                          <span className="text-xs">{u.tempo_por_tela[0].tela} <span className="text-muted-foreground">({u.tempo_por_tela[0].pct}%)</span></span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                  {usuarios.length === 0 && (
                    <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Sem atividade no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-muted/30 px-4 py-2.5 text-[11px] text-muted-foreground">
              Tempo estimado pela navegação (intervalos entre eventos, sessão fecha após 30min parado). Serve como proxy de dedicação por processo — base para o cálculo de ROI.
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {sel && <PainelPessoa usuario={sel} onClose={() => setSel(null)} cerebroItems={(cerebro?.items ?? []).filter((i) => i.consultor === sel.nome)} />}
    </>
  );
}

function HeroStat({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-primary-foreground/70">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 font-display text-4xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-xs text-primary-foreground/70">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 py-2">
      <div className="font-display text-base font-bold leading-tight">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function TimelineGlobal({ usuarios }: { usuarios: AnaliseUsuario[] }) {
  const porDia = useMemo(() => {
    const eventos = usuarios.flatMap((u) => u.logs.map((l) => ({ ...l, nome: u.nome })));
    eventos.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    const grupos = new Map<string, typeof eventos>();
    for (const e of eventos.slice(0, 1500)) {
      const dia = e.criado_em.slice(0, 10);
      const g = grupos.get(dia) ?? [];
      g.push(e);
      grupos.set(dia, g);
    }
    return [...grupos.entries()];
  }, [usuarios]);

  if (porDia.length === 0) {
    return <div className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhum evento registrado ainda.</div>;
  }

  return (
    <div className="divide-y divide-border">
      {porDia.map(([dia, itens]) => (
        <div key={dia} className="px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {new Date(dia + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}
            </span>
            <Badge variant="secondary">{itens.length} eventos</Badge>
          </div>
          <div className="space-y-1">
            {itens.slice(0, 40).map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-xs">
                <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{fmtHora(l.criado_em)}</span>
                <span className="w-32 shrink-0 truncate font-medium">{l.nome}</span>
                <span className="rounded-md bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary">{ACAO_LABEL[l.acao] ?? l.acao}</span>
                <span className="truncate text-muted-foreground">{telaLabel(l.tela)}</span>
              </div>
            ))}
            {itens.length > 40 && <div className="text-[11px] italic text-muted-foreground">+{itens.length - 40} eventos</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PainelPessoa({ usuario, onClose, cerebroItems }: {
  usuario: AnaliseUsuario;
  onClose: () => void;
  cerebroItems: { id: number | string; persona: string; pergunta: string; created_at: unknown }[];
}) {
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
              {usuario.nome.slice(0, 2).toUpperCase()}
            </span>
            {usuario.nome}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-6">
          <div className="grid grid-cols-4 gap-2 text-center">
            <MiniStat label="Tempo" value={fmtDuracao(usuario.tempo_total_ms)} />
            <MiniStat label="Sessões" value={String(usuario.sessoes.length)} />
            <MiniStat label="Eventos" value={String(usuario.eventos)} />
            <MiniStat label="Clientes" value={String(usuario.clientes_tocados)} />
          </div>

          {/* Onde passa o tempo */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MonitorSmartphone className="h-3.5 w-3.5" /> Onde passa o tempo
            </h4>
            <div className="space-y-1.5">
              {usuario.tempo_por_tela.map((t) => (
                <div key={t.tela} className="flex items-center gap-2 text-xs">
                  <span className="w-36 shrink-0 truncate">{t.tela}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${t.pct}%` }} />
                  </div>
                  <span className="w-16 text-right text-muted-foreground">{fmtDuracao(t.ms)} · {t.pct}%</span>
                </div>
              ))}
            </div>
          </section>

          {/* Sessões — início → fim (base do tempo por processo / ROI) */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Sessões de trabalho
            </h4>
            <div className="space-y-1">
              {[...usuario.sessoes].reverse().slice(0, 15).map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-xs">
                  <span className="tabular-nums text-muted-foreground">{fmtDataHora(s.inicio)} → {fmtHora(s.fim)}</span>
                  <Badge variant="secondary">{fmtDuracao(s.duracao_ms)}</Badge>
                  <span className="ml-auto truncate text-muted-foreground">{s.telas.slice(0, 3).join(" · ")}</span>
                </div>
              ))}
              {usuario.sessoes.length === 0 && <div className="text-xs text-muted-foreground">Sem sessões no período.</div>}
            </div>
          </section>

          {/* O que fez */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ações no período</h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(usuario.acoes).sort((a, b) => b[1] - a[1]).map(([acao, n]) => (
                <Badge key={acao} variant="secondary">{ACAO_LABEL[acao] ?? acao}: {n}</Badge>
              ))}
            </div>
          </section>

          {/* Perguntas ao Cérebro */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Brain className="h-3.5 w-3.5" /> O que perguntou ao Cérebro
            </h4>
            <div className="space-y-1.5">
              {cerebroItems.slice(0, 20).map((c) => (
                <div key={c.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <div className="mb-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="capitalize">{c.persona}</span>
                    <span>{c.created_at ? fmtDataHora(String(c.created_at)) : ""}</span>
                  </div>
                  {c.pergunta}
                </div>
              ))}
              {cerebroItems.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma pergunta registrada.</div>}
            </div>
          </section>

          {/* Trilha completa */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trilha recente</h4>
            <div className="space-y-0.5">
              {usuario.logs.slice(0, 60).map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{fmtDataHora(l.criado_em)}</span>
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", l.acao === "perguntou_cerebro" ? "bg-violet-100 text-violet-700" : "bg-primary/8 text-primary")}>
                    {ACAO_LABEL[l.acao] ?? l.acao}
                  </span>
                  <span className="truncate text-muted-foreground">{telaLabel(l.tela)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
