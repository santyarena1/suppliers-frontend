"use client";

import { SlidersHorizontal } from "lucide-react";
import { ICON_STROKE, IllustrativeNote, SectionHead, Shell } from "./ui";

/** El desglose es contenido, no adorno: los anchos son la proporción real. */
const PARTS = [
  { label: "Precio de lista", amount: 119.37, color: "var(--lilac)" },
  { label: "IVA 21%", amount: 25.07, color: "rgb(191 210 255 / 0.55)" },
  { label: "Percepción IIBB 3%", amount: 3.58, color: "var(--ember)" },
];
const TOTAL = PARTS.reduce((s, p) => s + p.amount, 0);

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CostScene() {
  return (
    <section id="costo" className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={<>El precio que<br />vas a pagar</>}
          meta="02 · Costo real"
          lead="El número de la lista no es lo que te sale. NODO le suma el IVA de cada producto y las percepciones que te correspondan, y compara sobre el costo puesto, que es el único que sirve para decidir."
        />

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-8 items-start">
          <div className="lnd-panel p-5 sm:p-7">
            <div className="lnd-label">Fuente 700W 80 Plus Bronze · Fuente 02</div>

            <div className="mt-6 space-y-0">
              {PARTS.map((p) => (
                <div
                  key={p.label}
                  className="flex items-baseline justify-between gap-4 py-3 border-b"
                  style={{ borderColor: "var(--hair)" }}
                >
                  <span className="text-[0.88rem] text-[var(--fg-dim)] flex items-center gap-2.5">
                    <span
                      className="inline-block w-2.5 h-2.5 flex-shrink-0 rounded-[1px]"
                      style={{ background: p.color }}
                    />
                    {p.label}
                  </span>
                  <span className="lnd-mono text-[0.88rem]">USD {money(p.amount)}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-end justify-between gap-4">
              <span className="lnd-label">Costo puesto</span>
              <span className="lnd-mono text-[1.9rem] leading-none" style={{ color: "var(--ember)" }}>
                USD {money(TOTAL)}
              </span>
            </div>

            {/* Composición real del costo, a escala */}
            <div className="mt-5 flex h-2 w-full overflow-hidden rounded-[2px]">
              {PARTS.map((p) => (
                <div
                  key={p.label}
                  style={{ width: `${(p.amount / TOTAL) * 100}%`, background: p.color }}
                  title={`${p.label}: USD ${money(p.amount)}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="lnd-panel p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <SlidersHorizontal
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  strokeWidth={ICON_STROKE}
                  style={{ color: "var(--ember)" }}
                />
                <div>
                  <h3 className="text-[0.95rem] font-semibold">Cuando el distribuidor no lo informa</h3>
                  <p className="lnd-body mt-2 text-[0.85rem]">
                    Hay proveedores que no mandan la percepción de ingresos brutos, y otros que la
                    cotizan distinto a lo que te aplican. Cargás el porcentaje una vez en la
                    configuración de ese distribuidor y NODO lo usa siempre, por encima de lo que
                    diga el carrito.
                  </p>
                </div>
              </div>
            </div>

            <div className="lnd-panel p-5 sm:p-6">
              <h3 className="text-[0.95rem] font-semibold">Dólar y moneda</h3>
              <p className="lnd-body mt-2 text-[0.85rem]">
                Los distribuidores cotizan en dólares o en pesos, y no todos usan el mismo tipo de
                cambio. Elegís con qué cotización querés ver todo y la comparación queda pareja.
              </p>
            </div>
          </div>
        </div>

        <IllustrativeNote>
          Valores de ejemplo. Las alícuotas reales salen del catálogo de cada distribuidor y de lo
          que configures para tu comercio.
        </IllustrativeNote>
      </Shell>
    </section>
  );
}
