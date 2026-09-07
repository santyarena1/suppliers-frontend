import "../system.css";
import { CardBare, CardCatalog, RowDense, type Item } from "@/components/system/CardVariants";
import {
  ArrowRight,
  BarChart3,
  Clock,
  Cpu,
  DollarSign,
  Gamepad2,
  HardDrive,
  Laptop,
  Monitor,
  Mouse,
  Router,
  Search,
  ShoppingCart,
  TrendingUp,
  Zap,
} from "lucide-react";

export const metadata = { title: "NODO — Propuesta de rediseño del sistema" };

const STROKE = 1.4;

/** Datos de ejemplo con la misma forma que trae el catálogo real. */
const CARDS: Item[] = [
  {
    name: "AMD Ryzen 5 5600 3.5GHz AM4 sin cooler",
    provider: "Distribuidor A",
    providerColor: "#7c9cff",
    externalId: "100-100000927BOX",
    imageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23f4f6fa'/><rect x='62' y='62' width='76' height='76' rx='6' fill='%23cbd5e1'/><rect x='78' y='78' width='44' height='44' rx='3' fill='%2394a3b8'/><rect x='68' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='68' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='80' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='80' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='92' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='92' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='104' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='104' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='116' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='116' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='128' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='128' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><text x='100' y='186' font-family='monospace' font-size='9' fill='%2394a3b8' text-anchor='middle'>procesador</text></svg>",
    brand: "AMD",
    category: "Procesadores",
    price: "USD 119,37",
    priceAlt: "ARS 182.636",
    taxBadge: "+ IVA 21%",
    taxTitle: "Precio con IVA 21% incluido",
    dropPercent: 6,
    previousPrice: "USD 127,00",
    baseLine: "Base USD 98,65 · IIBB est. 3%",
    stock: 96,
    syncedAt: "sync hace 4 min",
  },
  {
    name: "Placa de video RTX 4060 8GB GDDR6 Dual",
    provider: "Distribuidor B",
    providerColor: "#35c98a",
    externalId: "DUAL-RTX4060-O8G",
    imageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23f4f6fa'/><rect x='30' y='74' width='140' height='58' rx='5' fill='%23cbd5e1'/><circle cx='72' cy='103' r='19' fill='%2394a3b8'/><circle cx='126' cy='103' r='19' fill='%2394a3b8'/><rect x='30' y='64' width='140' height='10' rx='3' fill='%23e2e8f0'/><text x='100' y='186' font-family='monospace' font-size='9' fill='%2394a3b8' text-anchor='middle'>placa de video</text></svg>",
    brand: "ASUS",
    category: "Placas de video",
    price: "USD 312,80",
    priceAlt: "ARS 478.584",
    taxBadge: "+ IVA 21%",
    imageAiSelected: true,
    baseLine: "Base USD 258,51 · IIBB est. 3%",
    stock: 4,
    schemeHint: "Esquema USD 297,16 (−5%)",
    location: "Depósito CABA",
    syncedAt: "sync hace 12 min",
  },
  {
    name: "SSD NVMe 1TB Gen4 7000MB/s M.2 2280",
    provider: "Distribuidor C",
    providerColor: "#ff9d5c",
    externalId: "SSD1TBG4",
    imageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23f4f6fa'/><rect x='52' y='86' width='96' height='30' rx='4' fill='%23cbd5e1'/><rect x='60' y='94' width='34' height='14' rx='2' fill='%2394a3b8'/><rect x='132' y='90' width='8' height='22' rx='0' fill='%2394a3b8'/><text x='100' y='186' font-family='monospace' font-size='9' fill='%2394a3b8' text-anchor='middle'>ssd m.2</text></svg>",
    brand: "Kingston",
    category: "Almacenamiento",
    price: "USD 62,10",
    priceAlt: "ARS 95.013",
    taxBadge: "Sin imp.",
    taxTitle: "Precio sin impuestos",
    baseLine: "Base USD 62,10 · s/imp",
    stock: 0,
    missingIva: true,
    syncedAt: "lista de hoy",
    listOverdue: "lista vencida hace 4 días",
  },
  {
    name: "Monitor 27\" 180Hz IPS 1ms FreeSync",
    provider: "Distribuidor D",
    providerColor: "#c08cff",
    externalId: "MON27180",
    imageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23f4f6fa'/><rect x='34' y='52' width='132' height='80' rx='5' fill='%23cbd5e1'/><rect x='42' y='60' width='116' height='64' rx='2' fill='%2394a3b8'/><rect x='88' y='132' width='24' height='18' rx='0' fill='%23cbd5e1'/><rect x='66' y='150' width='68' height='7' rx='3' fill='%23cbd5e1'/><text x='100' y='186' font-family='monospace' font-size='9' fill='%2394a3b8' text-anchor='middle'>monitor</text></svg>",
    brand: "Gigabyte",
    category: "Monitores",
    price: "USD 184,00",
    priceAlt: "ARS 281.520",
    taxBadge: "+ IVA 10,5%",
    dropPercent: 4,
    previousPrice: "USD 191,60",
    baseLine: "Base USD 166,51 · IIBB 3%",
    stock: null,
    syncedAt: "sync hace 1 h",
  },
];

const STATS = [
  { k: "Proveedores activos", v: "8", sub: "de 15 conectados", icon: Zap },
  { k: "Dólar oficial", v: "1.530", sub: "convertido a ARS", icon: DollarSign },
  { k: "En el carrito", v: "12", sub: "5 proveedores", icon: ShoppingCart },
  { k: "Búsquedas guardadas", v: "6", sub: "historial local", icon: Clock },
];

const CATEGORIES = [
  { label: "Procesadores", icon: Cpu },
  { label: "Placas de video", icon: Monitor },
  { label: "SSD", icon: HardDrive },
  { label: "Memoria RAM", icon: BarChart3 },
  { label: "Monitores", icon: Monitor },
  { label: "Notebooks", icon: Laptop },
  { label: "Periféricos", icon: Mouse },
  { label: "Gaming", icon: Gamepad2 },
  { label: "Routers", icon: Router },
  { label: "UPS / Energía", icon: Zap },
];

const TOP = [
  { q: "sentey", n: 9 },
  { q: "amd", n: 8 },
  { q: "raptor", n: 4 },
  { q: "corsair", n: 4 },
  { q: "5600", n: 3 },
  { q: "5800", n: 2 },
];

const RECENT = [
  { q: "amd", t: "hace 2 h" },
  { q: "corsair", t: "hace 2 h" },
  { q: "lnz", t: "hace 12 h" },
  { q: "sentey", t: "hace 12 h" },
  { q: "evolabs", t: "hace 13 h" },
  { q: "arkham", t: "hace 40 h" },
];

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[0.78rem] leading-relaxed max-w-3xl"
      style={{ color: "var(--sys-fg-dim)" }}
    >
      {children}
    </p>
  );
}

export default function PreviewPage() {
  return (
    <div className="sys min-h-screen">
      <div className="mx-auto w-full max-w-[1280px] px-6 sm:px-8 py-10 sm:py-14">
        {/* Encabezado de la propuesta */}
        <header className="mb-12">
          <span className="sys-label">Propuesta · no está en producción</span>
          <h1 className="sys-title text-[2rem] sm:text-[2.6rem] mt-3">
            Rediseño del sistema
          </h1>
          <Note>
            Mismo idioma que la landing: fondo profundo, violeta solo para la acción, ámbar solo
            para lo que importa, Archivo para títulos y Chivo Mono para todo número. Sin partículas
            en movimiento, sin grano y sin bloom: eso sirve para convencer a alguien que llega, no
            para trabajar ocho horas. Ninguna información de las pantallas actuales fue eliminada.
          </Note>
        </header>

        {/* --- HOME --- */}
        <section className="mb-16">
          <div className="flex items-end gap-5 mb-6">
            <h2 className="sys-title text-[1.4rem]">Inicio</h2>
            <div className="flex-1 h-px" style={{ background: "var(--sys-hair)" }} />
          </div>

          {/* Cabecera con la búsqueda como acción principal */}
          <div
            className="relative overflow-hidden rounded-xl p-7 sm:p-9 mb-4"
            style={{
              background: "linear-gradient(135deg, #1a1f36 0%, #141828 60%, #10131f 100%)",
              border: "1px solid var(--sys-hair)",
            }}
          >
            <div className="sys-mesh" />
            <div className="relative">
              <h3 className="sys-title text-[1.6rem] sm:text-[2rem] max-w-lg">
                Buscá en todos tus distribuidores a la vez
              </h3>
              <div className="mt-6 flex flex-col sm:flex-row gap-2.5 max-w-2xl">
                <div
                  className="flex-1 flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{ background: "var(--sys-sunken)", border: "1px solid var(--sys-hair-strong)" }}
                >
                  <Search className="w-4 h-4 flex-shrink-0" strokeWidth={STROKE} style={{ color: "var(--sys-accent)" }} />
                  <span style={{ color: "var(--sys-fg-faint)" }} className="text-[0.9rem]">
                    ¿Qué producto buscás?
                  </span>
                </div>
                <button className="sys-btn sys-btn--primary">Buscar</button>
              </div>
              <p className="sys-label mt-4">
                Cotizaciones para WhatsApp · presupuestos listos para enviar
              </p>
            </div>
          </div>

          {/* Métricas: una tira con divisiones finas, no cuatro cajas sueltas */}
          <div className="sys-panel mb-4 grid grid-cols-2 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <div
                key={s.k}
                className="p-5"
                style={{
                  borderLeft: i % 4 === 0 ? "none" : "1px solid var(--sys-hair)",
                  borderTop: i > 1 ? "1px solid var(--sys-hair)" : "none",
                }}
              >
                <div className="flex items-center gap-2">
                  <s.icon className="w-3.5 h-3.5" strokeWidth={STROKE} style={{ color: "var(--sys-fg-faint)" }} />
                  <span className="sys-label">{s.k}</span>
                </div>
                <div className="sys-num text-[1.75rem] leading-none mt-3">{s.v}</div>
                <div className="text-[0.72rem] mt-1.5" style={{ color: "var(--sys-fg-faint)" }}>
                  {s.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Categorías */}
          <div className="sys-panel mb-4">
            <div className="sys-panel__head">
              <span className="sys-label">Buscar por categoría</span>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.label}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors"
                  style={{ background: "var(--sys-raised)", border: "1px solid transparent" }}
                >
                  <c.icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={STROKE} style={{ color: "var(--sys-accent)" }} />
                  <span className="text-[0.8rem] truncate">{c.label}</span>
                  <ArrowRight className="w-3 h-3 ml-auto flex-shrink-0" strokeWidth={STROKE} style={{ color: "var(--sys-fg-faint)" }} />
                </button>
              ))}
            </div>
          </div>

          {/* Historial */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="sys-panel">
              <div className="sys-panel__head">
                <span className="sys-label">Tus búsquedas más frecuentes</span>
                <TrendingUp className="w-3.5 h-3.5" strokeWidth={STROKE} style={{ color: "var(--sys-fg-faint)" }} />
              </div>
              {TOP.map((t, i) => (
                <div
                  key={t.q}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--sys-hair)" }}
                >
                  <span className="sys-num text-[0.7rem] w-4" style={{ color: "var(--sys-fg-faint)" }}>
                    {i + 1}
                  </span>
                  <span className="text-[0.85rem] flex-1 truncate">{t.q}</span>
                  <span className="sys-num text-[0.7rem]" style={{ color: "var(--sys-fg-faint)" }}>
                    {t.n}×
                  </span>
                  <ArrowRight className="w-3 h-3" strokeWidth={STROKE} style={{ color: "var(--sys-fg-faint)" }} />
                </div>
              ))}
            </div>

            <div className="sys-panel">
              <div className="sys-panel__head">
                <span className="sys-label">Últimas búsquedas</span>
                <Clock className="w-3.5 h-3.5" strokeWidth={STROKE} style={{ color: "var(--sys-fg-faint)" }} />
              </div>
              {RECENT.map((r, i) => (
                <div
                  key={r.q}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--sys-hair)" }}
                >
                  <Search className="w-3 h-3 flex-shrink-0" strokeWidth={STROKE} style={{ color: "var(--sys-fg-faint)" }} />
                  <span className="text-[0.85rem] flex-1 truncate">{r.q}</span>
                  <span className="sys-num text-[0.7rem]" style={{ color: "var(--sys-fg-faint)" }}>
                    {r.t}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- TARJETAS: TRES PROPUESTAS --- */}
        <section className="mb-16">
          <div className="flex items-end gap-5 mb-6">
            <h2 className="sys-title text-[1.4rem]">Tarjetas · tres caminos</h2>
            <div className="flex-1 h-px" style={{ background: "var(--sys-hair)" }} />
          </div>

          <Note>
            Las tres muestran exactamente los mismos datos del producto. Lo que cambia es la
            decisión de diseño, no la información. En las tres saqué los avisos de lo que el
            producto <em>no</em> tiene: &ldquo;sin offline&rdquo;, &ldquo;sin esquema&rdquo; y
            &ldquo;stock sin dato&rdquo; llenaban la tarjeta con ausencias. Eso solo importa cuando
            estás comprando en ese modo, y ahí se resuelve atenuando el producto, no rotulándolo.
          </Note>

          {/* A */}
          <div className="mt-10">
            <div className="flex items-baseline gap-3 mb-1">
              <span className="sys-num text-[1.1rem]" style={{ color: "var(--sys-fg-faint)" }}>A</span>
              <h3 className="sys-title text-[1.05rem]">Ficha de catálogo</h3>
            </div>
            <Note>
              Clara, como una página de catálogo impreso. La foto manda y va a sangre, sin pastillas
              encima. Nada de divisiones internas: separa el aire, no las líneas. Es la que mejor
              hace lucir el producto y la más cercana a lo que ya tenés.
            </Note>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              {CARDS.map((c, i) => (
                <CardCatalog key={c.externalId} it={c} delay={i * 60} />
              ))}
            </div>
          </div>

          {/* B */}
          <div className="mt-14">
            <div className="flex items-baseline gap-3 mb-1">
              <span className="sys-num text-[1.1rem]" style={{ color: "var(--sys-fg-faint)" }}>B</span>
              <h3 className="sys-title text-[1.05rem]">Fila de precio</h3>
            </div>
            <Note>
              No es una tarjeta: es una fila. Cuando comparás cuarenta productos, los precios
              alineados en una columna se recorren de arriba abajo de un saque; una grilla de
              tarjetas te obliga a saltar en zigzag. Entra el triple de productos por pantalla.
            </Note>
            <div className="sys-panel mt-5 overflow-hidden">
              <div className="sys-panel__head">
                <span className="sys-label">4 resultados · ordenados por precio</span>
                <span className="sys-label">Precio puesto</span>
              </div>
              {CARDS.map((c, i) => (
                <RowDense key={c.externalId} it={c} i={i} />
              ))}
            </div>
          </div>

          {/* C */}
          <div className="mt-14">
            <div className="flex items-baseline gap-3 mb-1">
              <span className="sys-num text-[1.1rem]" style={{ color: "var(--sys-fg-faint)" }}>C</span>
              <h3 className="sys-title text-[1.05rem]">Ficha sin cajas</h3>
            </div>
            <Note>
              Oscura, sin recuadro ni divisiones: la tarjeta se apoya en el fondo del sistema en vez
              de dibujar otro contenedor arriba. El precio es lo más grande y todo lo demás baja en
              una escalera tipográfica. Es la más silenciosa de las tres.
            </Note>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 mt-5">
              {CARDS.map((c, i) => (
                <CardBare key={c.externalId} it={c} delay={i * 60} />
              ))}
            </div>
          </div>
        </section>

        <footer className="pt-8" style={{ borderTop: "1px solid var(--sys-hair)" }}>
          <p className="sys-label leading-relaxed normal-case tracking-[0.06em]">
            Vista de propuesta. No toca el sistema en funcionamiento ni cambia ninguna ruta real.
          </p>
        </footer>
      </div>
    </div>
  );
}
