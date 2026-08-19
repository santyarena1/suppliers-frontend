"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { PricePoint } from "@/lib/api";
import { parsePrice } from "@/lib/format";

export default function PriceHistoryChart({ points }: { points: PricePoint[] }) {
  const data = points.map((p) => ({
    date: new Date(p.capturedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }),
    price: parsePrice(p.price),
  }));

  return (
    <div className="h-48 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={{ stroke: "#3f3f46" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => `$${Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(value) => [`US$ ${Number(value).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`, "Precio"]}
          />
          <Line type="stepAfter" dataKey="price" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
