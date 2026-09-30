"use client";

import SystemShot from "./SystemShot";
import { SectionHead, Shell } from "./ui";

const POINTS = [
  {
    t: "Una consulta, todos tus catálogos",
    d: "Escribís el producto una vez. NODO recorre los distribuidores que conectaste y te muestra quién lo tiene, con stock y última actualización.",
  },
  {
    t: "El mismo ítem, varias ofertas",
    d: "En la ficha ves las ofertas cruzadas del mismo producto. Comparás sobre el costo puesto, no sobre el número de lista.",
  },
  {
    t: "Vista grilla, lista o por distribuidor",
    d: "Elegís cómo trabajar: tarjetas, lista compacta o agrupado por proveedor, con los mismos filtros de marca, categoría y stock.",
  },
];

export default function SearchScene() {
  return (
    <section id="buscar" className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={
            <>
              Una sola
              <br />
              búsqueda
            </>
          }
          meta="01 · Búsqueda"
          lead="Cada distribuidor tiene su portal, su login y su lista. Al conectarlos dejan de ser diez búsquedas: escribís el producto y ves quiénes lo tienen, desde qué precio y con cuánto stock."
        />

        <SystemShot
          src="/static/landing/shots/search-grid.webp"
          alt="Resultados del buscador unificado de NODO"
          caption="Buscador unificado · captura del sistema en producción"
          priority
        />

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.t} className="lnd-panel p-5 sm:p-6">
              <h3 className="text-[0.95rem] font-medium text-[var(--fg)]">{p.t}</h3>
              <p className="lnd-note mt-3 leading-relaxed">{p.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <SystemShot
            src="/static/landing/shots/product.webp"
            alt="Ficha de producto con desglose de costo e impuestos"
            caption="Ficha de producto · costo con IVA y percepciones"
          />
          <SystemShot
            src="/static/landing/shots/compare.webp"
            alt="Comparador de productos entre distribuidores"
            caption="Comparador · mismo ítem ordenado por costo puesto"
          />
        </div>
      </Shell>
    </section>
  );
}
