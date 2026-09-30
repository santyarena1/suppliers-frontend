"use client";

import SystemShot from "./SystemShot";
import { SectionHead, Shell } from "./ui";

const PARTS = [
  { label: "Precio de lista del distribuidor", detail: "El neto que publica cada proveedor" },
  { label: "IVA del producto", detail: "Según la alícuota de cada ítem" },
  { label: "Percepciones e IIBB", detail: "Las que te corresponden a vos como comercio" },
  { label: "Costo puesto", detail: "El único número que sirve para decidir" },
];

export default function CostScene() {
  return (
    <section id="costo" className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={
            <>
              El precio que
              <br />
              vas a pagar
            </>
          }
          meta="02 · Costo real"
          lead="El número de la lista no es lo que te sale. NODO suma IVA y percepciones, convierte con la cotización que elijas y compara sobre el costo puesto — el que importa al cerrar la compra."
        />

        <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-8 items-start">
          <ol className="lnd-panel p-5 sm:p-7 space-y-0">
            {PARTS.map((p, i) => (
              <li
                key={p.label}
                className="flex gap-4 py-4 border-b last:border-b-0"
                style={{ borderColor: "var(--hair)" }}
              >
                <span className="lnd-mono text-[0.72rem] text-[var(--fg-faint)] pt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="text-[0.92rem] text-[var(--fg)]">{p.label}</div>
                  <p className="lnd-note mt-1">{p.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <SystemShot
            src="/static/landing/shots/product.webp"
            alt="Desglose de costo en la ficha de producto de NODO"
            caption="Desglose real en la ficha · precios ocultos en la captura"
          />
        </div>
      </Shell>
    </section>
  );
}
