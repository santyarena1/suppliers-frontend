import { CircleDot, Users } from "lucide-react";

/**
 * Vistas de ejemplo de las pantallas principales de marcas y distribuidores.
 * Datos inventados y sin nombres: distribuidores y comercios van numerados.
 */

type Light = "ok" | "low" | "out";

const LIGHT: Record<Light, { dot: string; label: string }> = {
  ok: { dot: "bg-[var(--good)]", label: "Con stock" },
  low: { dot: "bg-[var(--warn)]", label: "Poco stock" },
  out: { dot: "bg-[#f06a6a]", label: "Sin stock" },
};

const SKUS: { name: string; suggested: number; cells: { light: Light; units: number; price: number }[] }[] = [
  {
    name: "DIMM 16GB DDR4 3200",
    suggested: 29.9,
    cells: [
      { light: "ok", units: 80, price: 29.5 },
      { light: "ok", units: 44, price: 30.4 },
      { light: "low", units: 6, price: 31.9 },
    ],
  },
  {
    name: "SODIMM 16GB DDR5 5600",
    suggested: 45.0,
    cells: [
      { light: "low", units: 4, price: 44.2 },
      { light: "out", units: 0, price: 0 },
      { light: "ok", units: 12, price: 46.1 },
    ],
  },
  {
    name: "SSD 1TB NVMe Gen4",
    suggested: 72.0,
    cells: [
      { light: "ok", units: 36, price: 71.5 },
      { light: "ok", units: 21, price: 74.9 },
      { light: "out", units: 0, price: 0 },
    ],
  },
  {
    name: "DIMM 32GB DDR5 6000",
    suggested: 98.0,
    cells: [
      { light: "out", units: 0, price: 0 },
      { light: "low", units: 3, price: 101.0 },
      { light: "ok", units: 18, price: 97.4 },
    ],
  },
];

const usd = (n: number) => `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StockLightPreview() {
  return (
    <div className="nl-surface overflow-hidden" role="img" aria-label="Ejemplo del semáforo de stock de una marca por distribuidor">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <CircleDot className="h-4 w-4 text-[var(--accent-2)]" aria-hidden /> Semáforo de stock
        </p>
        <span className="text-xs text-[var(--fg-3)]">Precio contra tu sugerido</span>
      </div>
      <div className="overflow-x-auto [scrollbar-width:none]">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead>
            <tr className="text-xs text-[var(--fg-3)]">
              <th className="px-5 py-3 font-medium">Producto</th>
              {["Distribuidor 1", "Distribuidor 2", "Distribuidor 3"].map((d) => (
                <th key={d} className="px-3 py-3 font-medium">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SKUS.map((s) => (
              <tr key={s.name} className="border-t border-[var(--line)]">
                <td className="px-5 py-3">
                  <p className="text-white">{s.name}</p>
                  <p className="text-xs text-[var(--fg-3)]">Sugerido {usd(s.suggested)}</p>
                </td>
                {s.cells.map((c, i) => {
                  const diff = c.price ? ((c.price - s.suggested) / s.suggested) * 100 : 0;
                  return (
                    <td key={i} className="px-3 py-3 align-top">
                      <span className="inline-flex items-center gap-1.5 text-[var(--fg)]">
                        <span className={`h-2.5 w-2.5 rounded-full ${LIGHT[c.light].dot}`} aria-hidden />
                        {c.units ? `${c.units} u.` : "Sin stock"}
                      </span>
                      {c.price > 0 && (
                        <p className={`mt-0.5 whitespace-nowrap text-xs tabular-nums ${Math.abs(diff) < 3 ? "text-[var(--fg-3)]" : diff > 0 ? "text-[var(--warn)]" : "text-[var(--good)]"}`}>
                          {usd(c.price)} · {diff > 0 ? "+" : ""}
                          {diff.toFixed(0)} %
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-[var(--line)] px-5 py-3 text-xs text-[var(--fg-3)]">
        {(Object.keys(LIGHT) as Light[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${LIGHT[k].dot}`} aria-hidden /> {LIGHT[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}

const CLIENTS = [
  { name: "Comercio 1", seller: "Lucía", last: "hoy", orders: 14, state: "active" },
  { name: "Comercio 2", seller: "Lucía", last: "hace 3 días", orders: 9, state: "active" },
  { name: "Comercio 3", seller: "Martín", last: "hace 41 días", orders: 6, state: "inactive" },
  { name: "Comercio 4", seller: "Sin asignar", last: "hace 8 días", orders: 3, state: "active" },
  { name: "Comercio 5", seller: "Martín", last: "Sin pedidos", orders: 0, state: "new" },
] as const;

const STATE = {
  active: { label: "Compra seguido", cls: "bg-[rgb(62_207_142/0.12)] text-[#7fe3b4]" },
  inactive: { label: "Dejó de comprar", cls: "bg-[rgb(245_176_65/0.13)] text-[#f7c774]" },
  new: { label: "Nuevo", cls: "bg-[var(--accent-soft)] text-[var(--accent-2)]" },
} as const;

export function PortfolioPreview() {
  return (
    <div className="nl-surface overflow-hidden" role="img" aria-label="Ejemplo de la cartera de comercios de un distribuidor">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <Users className="h-4 w-4 text-[var(--accent-2)]" aria-hidden /> Clientes
        </p>
        <span className="text-xs text-[var(--fg-3)]">5 comercios · 2 vendedores</span>
      </div>
      <div className="flex gap-2 border-b border-[var(--line)] px-5 py-3 text-xs">
        {["Todos los vendedores", "Dejaron de comprar"].map((f, i) => (
          <span
            key={f}
            className={`rounded-lg border px-2.5 py-1.5 ${i === 0 ? "border-[var(--line-2)] text-[var(--fg-2)]" : "border-[rgb(245_176_65/0.35)] text-[#f7c774]"}`}
          >
            {f}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-[var(--line)]">
        {CLIENTS.map((c) => (
          <li key={c.name} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="text-sm text-white">{c.name}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--fg-3)]">
                {c.seller} · último pedido {c.last} · {c.orders} pedidos
              </p>
            </div>
            <span className={`whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium ${STATE[c.state].cls}`}>
              {STATE[c.state].label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
