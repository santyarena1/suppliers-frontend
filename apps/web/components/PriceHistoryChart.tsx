"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { PricePoint } from "@/lib/api";
import { parsePrice } from "@/lib/format";

export default function PriceHistoryChart({
  points,
  fillHeight = false,
}: {
  points: PricePoint[];
  /** Usa altura del contenedor padre en vez de altura fija del gráfico */
  fillHeight?: boolean;
}) {
  const data = useMemo(
    () =>
      [...points]
        .sort(
          (a, b) =>
            new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
        )
        .map((p) => ({
          capturedAt: p.capturedAt,
          price: parsePrice(p.finalPrice ?? p.price),
          label: new Date(p.capturedAt).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "short",
          }),
        })),
    [points],
  );

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const first = data[0].price;
    const last = data[data.length - 1].price;
    const change = last - first;
    const changePct = first > 0 ? (change / first) * 100 : 0;
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return { min, max, first, last, change, changePct, avg };
  }, [data]);

  if (data.length < 2 || !stats) {
    return (
      <div className="rounded-xl border border-dashed border-surface-700 bg-surface-950/40 px-4 py-8 text-center">
        <p className="text-sm text-surface-500">
          Aún no hay suficientes registros para graficar el historial.
        </p>
      </div>
    );
  }

  const TrendIcon =
    stats.change < -0.01
      ? TrendingDown
      : stats.change > 0.01
        ? TrendingUp
        : Minus;
  const trendColor =
    stats.change < -0.01
      ? "text-emerald-400"
      : stats.change > 0.01
        ? "text-rose-400"
        : "text-surface-400";
  const strokeColor =
    stats.change < -0.01
      ? "#34d399"
      : stats.change > 0.01
        ? "#fb7185"
        : "#94a3b8";
  const fillId = "priceHistoryFill";

  function formatUsd(n: number) {
    return `US$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
  }

  function formatFullDate(iso: string) {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-surface-800 bg-surface-950/60 ${
        fillHeight ? "flex h-full flex-col" : ""
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-surface-800 px-4 py-3 sm:px-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-surface-500">
            Precio actual
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-white">
            {formatUsd(stats.last)}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-medium ${trendColor}`}>
          <TrendIcon className="h-4 w-4" />
          <span className="tabular-nums">
            {stats.change >= 0 ? "+" : ""}
            {formatUsd(stats.change)}
          </span>
          <span className="tabular-nums text-xs opacity-80">
            ({stats.changePct >= 0 ? "+" : ""}
            {stats.changePct.toFixed(1)}%)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-surface-800 border-b border-surface-800 text-center">
        <div className="px-2 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-surface-500">
            Mínimo
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-400">
            {formatUsd(stats.min)}
          </p>
        </div>
        <div className="px-2 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-surface-500">
            Promedio
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-surface-100">
            {formatUsd(stats.avg)}
          </p>
        </div>
        <div className="px-2 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-surface-500">
            Máximo
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-rose-400">
            {formatUsd(stats.max)}
          </p>
        </div>
      </div>

      <div
        className={`w-full px-2 pb-2 pt-4 sm:px-3 ${
          fillHeight ? "min-h-0 flex-1" : "h-52 sm:h-56"
        }`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#71717a" }}
              tickLine={false}
              axisLine={{ stroke: "#3f3f46" }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: "#71717a" }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) =>
                `$${Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
              }
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as {
                  capturedAt: string;
                  price: number;
                };
                return (
                  <div className="rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 shadow-lg">
                    <p className="text-[11px] text-surface-400">
                      {formatFullDate(point.capturedAt)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                      {formatUsd(point.price)}
                    </p>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={stats.avg}
              stroke="#71717a"
              strokeDasharray="4 4"
              strokeOpacity={0.55}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={strokeColor}
              strokeWidth={2.25}
              fill={`url(#${fillId})`}
              dot={
                data.length <= 12
                  ? { r: 3, fill: strokeColor, strokeWidth: 0 }
                  : false
              }
              activeDot={{
                r: 5,
                strokeWidth: 2,
                stroke: "#18181b",
                fill: strokeColor,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="border-t border-surface-800 px-4 py-2 text-[11px] text-surface-500 sm:px-5">
        {data.length} registros · {formatFullDate(data[0].capturedAt)} →{" "}
        {formatFullDate(data[data.length - 1].capturedAt)}
        {" · "}línea punteada = promedio
      </p>
    </div>
  );
}
