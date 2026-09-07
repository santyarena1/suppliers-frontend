"use client";

import { Search, SlidersHorizontal, TrendingDown } from "lucide-react";
import { Chip, ICON_STROKE, IllustrativeNote, Reveal, SectionHead, Shell } from "./ui";

/**
 * Ejemplo ilustrativo coherente: una búsqueda y sus coincidencias reales.
 * Cada fila es un producto; las columnas dicen en cuántos distribuidores está,
 * cómo se movió su precio y desde cuánto arranca.
 */
const QUERY = "ryzen 5";

const RESULTS = [
  { name: "AMD Ryzen 5 5600", spec: "AM4 · 6 núcleos", sources: 4, min: "119,37", max: "128,40", drop: "-6%" },
  { name: "AMD Ryzen 5 5600G", spec: "AM4 · con gráficos", sources: 3, min: "138,90", max: "149,00", drop: null },
  { name: "AMD Ryzen 5 7600", spec: "AM5 · 6 núcleos", sources: 5, min: "198,00", max: "221,40", drop: "-4%" },
  { name: "AMD Ryzen 5 8600G", spec: "AM5 · con gráficos", sources: 2, min: "232,10", max: "244,00", drop: null },
];

const COLS = "grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.7fr)_9rem_6rem_8rem]";

export default function SearchScene() {
  return (
    <section id="buscar" className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={<>Una sola<br />búsqueda</>}
          meta="01 · Búsqueda"
          lead="Cada distribuidor tiene su portal, su login y su lista. Al conectarlos dejan de ser diez búsquedas y pasan a ser una: escribís el producto y ves quiénes lo tienen, desde qué precio y cómo se viene moviendo."
        />

        <Reveal className="lnd-panel overflow-hidden">
          {/* Barra de búsqueda */}
          <div
            className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b"
            style={{ borderColor: "var(--hair)" }}
          >
            <Search
              className="w-4 h-4 flex-shrink-0"
              strokeWidth={ICON_STROKE}
              style={{ color: "var(--lilac)" }}
            />
            <span className="text-[0.92rem] flex-1 min-w-0 truncate">{QUERY}</span>
            <span className="lnd-note hidden sm:block">4 coincidencias en 6 distribuidores</span>
          </div>

          {/* Filtros */}
          <div
            className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b overflow-x-auto"
            style={{ borderColor: "var(--hair)" }}
          >
            <SlidersHorizontal
              className="w-3.5 h-3.5 flex-shrink-0"
              strokeWidth={ICON_STROKE}
              style={{ color: "var(--fg-faint)" }}
            />
            <Chip tone="ember">Con stock</Chip>
            <Chip>Marca</Chip>
            <Chip>Distribuidor</Chip>
            <Chip>Categoría</Chip>
          </div>

          {/* Encabezado de columnas: sin esto la tabla no se explica sola */}
          <div className={`hidden sm:grid ${COLS} gap-4 px-4 sm:px-5 py-2.5`}>
            <span className="lnd-label">Producto</span>
            <span className="lnd-label text-right">Lo tienen</span>
            <span className="lnd-label text-right">7 días</span>
            <span className="lnd-label text-right">Desde</span>
          </div>

          {RESULTS.map((r) => (
            <div key={r.name} className={`lnd-row ${COLS}`}>
              <div className="min-w-0">
                <div className="text-[0.92rem] truncate">{r.name}</div>
                <div className="lnd-note mt-0.5">
                  {r.spec}
                  <span className="sm:hidden"> · {r.sources} distribuidores</span>
                </div>
              </div>

              <div className="hidden sm:block text-right">
                <span className="lnd-mono text-[0.85rem]">{r.sources}</span>
                <span className="lnd-note"> de 6</span>
              </div>

              <div className="hidden sm:block text-right">
                {r.drop ? (
                  <span
                    className="lnd-mono text-[0.78rem] inline-flex items-center gap-1"
                    style={{ color: "var(--ember)" }}
                  >
                    <TrendingDown className="w-3 h-3" strokeWidth={ICON_STROKE} />
                    {r.drop}
                  </span>
                ) : (
                  <span className="lnd-note">sin cambios</span>
                )}
              </div>

              <div className="text-right whitespace-nowrap">
                <div className="lnd-mono text-[0.95rem]">USD {r.min}</div>
                <div className="lnd-note mt-0.5">el más caro, {r.max}</div>
              </div>
            </div>
          ))}
        </Reveal>

        <IllustrativeNote>
          Datos de ejemplo. NODO guarda el histórico de cada precio, así que cuando uno baja te lo
          marca en vez de que lo tengas que descubrir comparando listas viejas.
        </IllustrativeNote>
      </Shell>
    </section>
  );
}
