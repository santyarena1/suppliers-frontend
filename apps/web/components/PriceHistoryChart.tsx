"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { PricePoint, ProductDTO } from "@/lib/api";
import { dailyChartPoints, argentinaDayKey } from "@/lib/price-history";
import { usePrefs } from "@/lib/prefs";
import { useIibbRatesEpoch } from "@/lib/iibb-rates";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import { displayAmountFromPricing } from "@/lib/display-price";
import type { PurchasePolicy } from "@/lib/purchase";

type RangePreset = "30d" | "90d" | "180d" | "365d" | "all" | "custom";

function ymdInput(d: Date): string {
  return argentinaDayKey(d);
}

function parseYmdLocal(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, day] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, day, 15, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysAgo(n: number, from = new Date()): Date {
  return new Date(from.getTime() - n * 24 * 60 * 60 * 1000);
}

const PRESETS: { id: RangePreset; label: string; short: string; days?: number }[] = [
  { id: "30d", label: "30 días", short: "30d", days: 30 },
  { id: "90d", label: "90 días", short: "90d", days: 90 },
  { id: "180d", label: "6 meses", short: "6m", days: 180 },
  { id: "365d", label: "12 meses", short: "12m", days: 365 },
  { id: "all", label: "Todo", short: "Todo" },
  { id: "custom", label: "Rango", short: "Rango" },
];

function useNarrowViewport(maxWidth = 640) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [maxWidth]);
  return narrow;
}

/** Tick del eje Y sin “US$” largo: en mobile el ancho importa más que el símbolo. */
function compactTick(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export default function PriceHistoryChart({
  points,
  product,
  policy,
  priceMode = "list",
  fillHeight = false,
  format,
}: {
  points: PricePoint[];
  /** Producto de la ficha: sirve para IVA/IIBB/líneas fiscales como el precio de arriba. */
  product: ProductDTO;
  policy?: PurchasePolicy | null;
  priceMode?: PriceMode;
  fillHeight?: boolean;
  /** Cómo escribir los importes (respeta USD/ARS del panel de prefs). */
  format?: (usd: number) => string;
}) {
  const { withIva, withIibb } = usePrefs();
  useIibbRatesEpoch();
  const narrow = useNarrowViewport();

  const seriesBounds = useMemo(() => {
    const times = points
      .map((p) => new Date(p.capturedAt).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return null;
    return { min: new Date(Math.min(...times)), max: new Date(Math.max(...times)) };
  }, [points]);

  const [preset, setPreset] = useState<RangePreset>("90d");
  const [fromYmd, setFromYmd] = useState("");
  const [toYmd, setToYmd] = useState("");

  useEffect(() => {
    if (!seriesBounds) return;
    const end = seriesBounds.max;
    const start90 = daysAgo(90, end);
    const start = start90.getTime() < seriesBounds.min.getTime() ? seriesBounds.min : start90;
    setFromYmd(ymdInput(start));
    setToYmd(ymdInput(end));
    setPreset("90d");
  }, [seriesBounds?.min.getTime(), seriesBounds?.max.getTime()]);

  function applyPreset(next: RangePreset) {
    setPreset(next);
    if (!seriesBounds || next === "custom") return;
    const end = seriesBounds.max;
    if (next === "all") {
      setFromYmd(ymdInput(seriesBounds.min));
      setToYmd(ymdInput(end));
      return;
    }
    const days = PRESETS.find((p) => p.id === next)?.days ?? 90;
    const startCand = daysAgo(days, end);
    const start =
      startCand.getTime() < seriesBounds.min.getTime() ? seriesBounds.min : startCand;
    setFromYmd(ymdInput(start));
    setToYmd(ymdInput(end));
  }

  /**
   * Misma lógica de display que el precio grande de la ficha: neto/bruto según
   * IVA, + IIBB si el toggle está activo, y después `format` pasa a ARS/USD.
   */
  const displayPoints = useMemo(() => {
    return points
      .map((p) => {
        const snapshot: ProductDTO = {
          ...product,
          price: p.price,
          finalPrice: p.finalPrice,
          currency: p.currency ?? product.currency,
        };
        const pricing = purchaseLinePricing(snapshot, policy, priceMode, 1);
        const shown = displayAmountFromPricing(pricing, {
          withIva,
          withIibb: withIibb && priceMode !== "offline",
          provider: product.provider,
        });
        return { capturedAt: p.capturedAt, price: shown.unitDisplayUsd };
      })
      .filter((p) => p.price > 0 && !Number.isNaN(new Date(p.capturedAt).getTime()));
  }, [points, product, policy, priceMode, withIva, withIibb]);

  const rangedPoints = useMemo(() => {
    const from = parseYmdLocal(fromYmd);
    const to = parseYmdLocal(toYmd);
    if (!from || !to) return displayPoints;
    const fromKey = argentinaDayKey(from);
    const toKey = argentinaDayKey(to);
    const lo = fromKey <= toKey ? fromKey : toKey;
    const hi = fromKey <= toKey ? toKey : fromKey;
    return displayPoints.filter((p) => {
      const k = argentinaDayKey(new Date(p.capturedAt));
      return k >= lo && k <= hi;
    });
  }, [displayPoints, fromYmd, toYmd]);

  const data = useMemo(() => {
    const until = parseYmdLocal(toYmd) ?? new Date();
    return dailyChartPoints(rangedPoints, until);
  }, [rangedPoints, toYmd]);

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

  const prefsHint = [
    withIva ? "con IVA" : "sin IVA",
    withIibb && priceMode !== "offline" ? "con IIBB" : "sin IIBB",
  ].join(" · ");

  if (displayPoints.length < 1) {
    return (
      <div className="rounded-xl border border-dashed border-surface-700 bg-surface-950/40 px-4 py-8 text-center">
        <p className="text-sm text-surface-500">
          Aún no hay suficientes registros para graficar el historial.
        </p>
      </div>
    );
  }

  const formatUsd = (n: number) =>
    format ? format(n) : `US$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

  function formatFullDate(iso: string) {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: narrow ? "short" : "long",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  }

  const TrendIcon =
    stats && stats.change < -0.01
      ? TrendingDown
      : stats && stats.change > 0.01
        ? TrendingUp
        : Minus;
  const trendColor =
    stats && stats.change < -0.01
      ? "text-emerald-400"
      : stats && stats.change > 0.01
        ? "text-rose-400"
        : "text-surface-400";
  const strokeColor =
    stats && stats.change < -0.01
      ? "#34d399"
      : stats && stats.change > 0.01
        ? "#fb7185"
        : "#94a3b8";
  const fillId = "priceHistoryFill";

  return (
    <div
      className={`overflow-hidden rounded-xl border border-surface-800 bg-surface-950/60 ${
        fillHeight ? "flex h-full flex-col" : ""
      }`}
    >
      <div className="flex flex-col gap-3 border-b border-surface-800 px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-surface-500">
              Precio en el rango
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-white sm:text-xl">
              {stats ? formatUsd(stats.last) : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-surface-500">{prefsHint}</p>
          </div>
          {stats && (
            <div className={`flex shrink-0 items-center gap-1 text-sm font-medium ${trendColor}`}>
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
          )}
        </div>

        {/* Chips en scroll horizontal: en mobile no se apilan en 3 filas. */}
        <div
          className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Rango del historial"
        >
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={preset === p.id}
              onClick={() => applyPreset(p.id)}
              className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors touch-manipulation ${
                preset === p.id
                  ? "border-brand-500 bg-brand-600/15 text-brand-300"
                  : "border-surface-700 text-surface-400 hover:border-surface-500 hover:text-surface-200"
              }`}
            >
              <span className="sm:hidden">{p.short}</span>
              <span className="hidden sm:inline">{p.label}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-surface-400 sm:flex sm:flex-wrap sm:items-center">
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
            <span className="text-surface-500">Desde</span>
            <input
              type="date"
              value={fromYmd}
              max={toYmd || undefined}
              onChange={(e) => {
                setPreset("custom");
                setFromYmd(e.target.value);
              }}
              className="w-full min-w-0 rounded-md border border-surface-700 bg-surface-900 px-2 py-1.5 text-surface-200 focus:border-brand-500 focus:outline-none sm:w-auto"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
            <span className="text-surface-500">Hasta</span>
            <input
              type="date"
              value={toYmd}
              min={fromYmd || undefined}
              onChange={(e) => {
                setPreset("custom");
                setToYmd(e.target.value);
              }}
              className="w-full min-w-0 rounded-md border border-surface-700 bg-surface-900 px-2 py-1.5 text-surface-200 focus:border-brand-500 focus:outline-none sm:w-auto"
            />
          </label>
        </div>
      </div>

      {!stats || data.length < 2 ? (
        <div className="px-3 py-10 text-center sm:px-5">
          <p className="text-sm text-surface-500">
            No hay suficientes días en ese rango para armar la curva.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 divide-x divide-surface-800 border-b border-surface-800 text-center">
            <div className="px-1.5 py-2.5 sm:px-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-surface-500">
                Mín
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-emerald-400 sm:text-sm">
                {formatUsd(stats.min)}
              </p>
            </div>
            <div className="px-1.5 py-2.5 sm:px-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-surface-500">
                Prom
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-surface-100 sm:text-sm">
                {formatUsd(stats.avg)}
              </p>
            </div>
            <div className="px-1.5 py-2.5 sm:px-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-surface-500">
                Máx
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-rose-400 sm:text-sm">
                {formatUsd(stats.max)}
              </p>
            </div>
          </div>

          <div
            className={`w-full px-1 pb-2 pt-3 sm:px-3 sm:pt-4 ${
              fillHeight ? "min-h-0 flex-1" : "h-48 sm:h-56"
            }`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={
                  narrow
                    ? { top: 6, right: 4, left: 0, bottom: 2 }
                    : { top: 8, right: 12, left: 4, bottom: 4 }
                }
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
                  tick={{ fontSize: narrow ? 10 : 11, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={{ stroke: "#3f3f46" }}
                  interval="preserveStartEnd"
                  minTickGap={narrow ? 40 : 28}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: narrow ? 10 : 11, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                  width={narrow ? 44 : 82}
                  tickFormatter={(v: number) =>
                    narrow ? compactTick(Number(v)) : formatUsd(Number(v))
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
                        <p className="mt-0.5 text-[10px] text-surface-500">{prefsHint}</p>
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
                  type="stepAfter"
                  dataKey="price"
                  stroke={strokeColor}
                  strokeWidth={2.25}
                  fill={`url(#${fillId})`}
                  dot={{
                    r: data.length > 40 ? 2 : 3,
                    fill: strokeColor,
                    strokeWidth: 0,
                  }}
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

          <p className="border-t border-surface-800 px-3 py-2 text-[11px] leading-relaxed text-surface-500 sm:px-5">
            {data.length} {data.length === 1 ? "día" : "días"} · {formatFullDate(data[0].capturedAt)} →{" "}
            {formatFullDate(data[data.length - 1].capturedAt)}
            <span className="hidden sm:inline">
              {" · "}línea punteada = promedio · máx. 12 meses
            </span>
          </p>
        </>
      )}
    </div>
  );
}
