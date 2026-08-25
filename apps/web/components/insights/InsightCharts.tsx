"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  fontSize: 12,
};

const TICK = { fontSize: 10, fill: "#71717a" };

function usd(value: number) {
  return `US$ ${Number(value).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function SpendAreaChart({
  data,
}: {
  data: { label: string; online: number; offline: number; spendUsd: number }[];
}) {
  if (data.length === 0) return <EmptyChart text="Sin movimientos en el período" />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: "#3f3f46" }} tickLine={false} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => usd(Number(v))} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(value, name) => [
              usd(Number(value)),
              name === "online" ? "Portal" : name === "offline" ? "Offline" : "Total",
            ]}
          />
          <Area type="monotone" dataKey="online" stackId="s" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.35} />
          <Area type="monotone" dataKey="offline" stackId="s" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.35} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RankBarChart({
  data,
  color = "#8b5cf6",
}: {
  data: { label: string; spendUsd: number }[];
  color?: string;
}) {
  const rows = data.slice(0, 12);
  if (rows.length === 0) return <EmptyChart text="Sin datos para graficar" />;
  const height = Math.max(180, rows.length * 28);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
          <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => usd(Number(v))} />
          <YAxis type="category" dataKey="label" tick={TICK} width={110} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [usd(Number(value)), "Comprado"]}
          />
          <Bar dataKey="spendUsd" fill={color} radius={[0, 6, 6, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const CHANNEL_COLORS: Record<string, string> = { ONLINE: "#8b5cf6", OFFLINE: "#f59e0b" };

export function ChannelPie({
  data,
}: {
  data: { channel: string; spendUsd: number; share: number }[];
}) {
  const rows = data.filter((d) => d.spendUsd > 0).map((d) => ({
    ...d,
    name: d.channel === "OFFLINE" ? "Offline" : "Portal",
  }));
  if (rows.length === 0) return <EmptyChart text="Sin mix de canal" />;
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="spendUsd" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
            {rows.map((row) => (
              <Cell key={row.channel} fill={CHANNEL_COLORS[row.channel] ?? "#71717a"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, _name, item) => {
              const share = (item?.payload as { share?: number })?.share;
              return [`${usd(Number(value))}${share != null ? ` · ${share}%` : ""}`, "Comprado"];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeekdayBars({
  data,
}: {
  data: { label: string; spendUsd: number; orders: number }[];
}) {
  if (data.every((d) => d.spendUsd === 0)) return <EmptyChart text="Sin actividad por día" />;
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: "#3f3f46" }} tickLine={false} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => usd(Number(v))} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [
              name === "orders" ? Number(value).toLocaleString("es-AR") : usd(Number(value)),
              name === "orders" ? "Pedidos" : "Comprado",
            ]}
          />
          <Bar dataKey="spendUsd" fill="#22d3ee" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-40 flex items-center justify-center text-xs text-surface-500 border border-dashed border-surface-800 rounded-lg">
      {text}
    </div>
  );
}
