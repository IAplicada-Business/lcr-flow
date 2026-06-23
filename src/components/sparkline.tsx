import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

// Série de contagem por dia nos últimos N dias, a partir de timestamps.
export function serieUltimosDias(dates: (string | null | undefined)[], dias = 14): { dia: string; v: number }[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const buckets = new Map<string, number>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  dates.forEach((ts) => {
    if (!ts) return;
    const key = new Date(ts).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  });
  return Array.from(buckets.entries()).map(([dia, v]) => ({ dia: dia.slice(5), v }));
}

export function Sparkline({ data, height = 56, color = "var(--color-primary)", id = "spark" }: {
  data: { dia: string; v: number }[]; height?: number; color?: string; id?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          cursor={{ stroke: "var(--color-border)" }}
          contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 11, padding: "4px 8px" }}
          labelFormatter={(l) => `Dia ${l}`}
          formatter={(v: number) => [v, "registros"]}
        />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
