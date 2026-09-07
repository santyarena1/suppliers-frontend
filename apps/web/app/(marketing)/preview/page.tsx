import type { Metadata } from "next";
import CardPass, { type PassCard } from "@/components/system/CardPass";
import SearchHome, { type ProvState, type SearchRow } from "@/components/system/SearchHome";
import "../landing.css";
import "../preview.css";

export const metadata: Metadata = {
  title: "NODO — Propuesta de sistema",
  robots: { index: false, follow: false },
};

/* Silueta neutra: el producto real de la captura, sin usar una foto ajena. */
const SHOT =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><g fill='none' stroke='#aab2c4' stroke-width='4' stroke-linecap='round'><path d='M28 70V56a32 32 0 0 1 64 0v14'/><rect x='18' y='66' width='18' height='30' rx='9' fill='#cbd2e0' stroke='none'/><rect x='84' y='66' width='18' height='30' rx='9' fill='#cbd2e0' stroke='none'/><path d='M30 96v6a10 10 0 0 0 10 10h10'/></g></svg>",
  );

const NAME = "AURICULAR RAZER BLACKSHARK V3 PRO WHITE HYPERSPEED WIRELESS+BT ANC THX";

const CARD: PassCard = {
  provider: "New Bytes",
  providerColor: "#0284c7",
  name: NAME,
  brand: "RAZER",
  category: "Auriculares",
  imageUrl: SHOT,
  price: "$ 402.409",
  priceAlt: "US$ 263,01",
  taxBadge: "+ IVA 10.5%",
  taxTitle: "Sobre el neto, alicuota informada por el distribuidor",
  baseLine: "Base US$ 238,02 · s/imp",
  stock: 12,
  offline: "off",
  scheme: "off",
  externalId: "121495",
  syncedAt: "Actualizado 7/9/26, 11:40 a. m.",
};

const CARD_B: PassCard = {
  ...CARD,
  provider: "Elit",
  providerColor: "#a855f7",
  name: "PROCESADOR AMD RYZEN 5 5600 3.5GHZ AM4 SIN VIDEO",
  brand: "AMD",
  category: "Procesadores",
  price: "$ 182.640",
  priceAlt: "US$ 119,37",
  previousPrice: "US$ 127,00",
  dropPercent: 6,
  taxBadge: "+ IVA 21%",
  baseLine: "Base US$ 98,65 · s/imp · IIBB 3,5%",
  stock: 96,
  offline: "on",
  scheme: null,
  location: "Depósito Buenos Aires",
  externalId: "AMD5600",
  syncedAt: "Actualizado 7/9/26, 11:38 a. m.",
};

const CARD_C: PassCard = {
  ...CARD,
  provider: "Air",
  providerColor: "#10b981",
  name: "SSD KINGSTON NV3 1TB NVME M.2 2280 PCIE 4.0 7000MB/S",
  brand: "Kingston",
  category: "Almacenamiento",
  price: "$ 95.014",
  priceAlt: "US$ 62,10",
  taxBadge: "+ IVA 21%",
  baseLine: "Base US$ 51,32 · s/imp",
  schemeHint: "Esquema US$ 59,80 (−3,7%)",
  stock: 0,
  offline: "off",
  scheme: "on",
  imageAiSelected: true,
  externalId: "SSD1T8G4",
  syncedAt: "Actualizado 7/9/26, 09:12 a. m.",
  listOverdue: "lista de ayer",
};

const PROVIDERS: ProvState[] = [
  { name: "New Bytes", color: "#0284c7", sync: "hace 4 min", on: true },
  { name: "Elit", color: "#a855f7", sync: "hace 6 min", on: true },
  { name: "Grupo Núcleo", color: "#10b981", sync: "hace 9 min", on: true },
  { name: "Air", color: "#06b6d4", sync: "hace 12 min", on: true },
  { name: "Invid", color: "#14b8a6", sync: "hace 18 min", on: true },
  { name: "GC", color: "#f97316", sync: "hace 22 min", on: true },
  { name: "Polytech", color: "#ef4444", sync: "hace 31 min", on: true },
  { name: "Ashir", color: "#ec4899", sync: "lista de ayer", on: true, stale: true },
  { name: "HDC", color: "#6366f1", sync: "hace 44 min", on: true },
  { name: "Distecna", color: "#eab308", sync: "sin credenciales", on: false },
  { name: "Ceven", color: "#84cc16", sync: "sin credenciales", on: false },
  { name: "Diapstore", color: "#8b5cf6", sync: "sin credenciales", on: false },
];

const TOP: SearchRow[] = [
  { q: "ryzen 5 5600", count: 34 },
  { q: "rtx 4060", count: 28 },
  { q: "ssd 1tb nvme", count: 19 },
  { q: "monitor 27 144hz", count: 12 },
  { q: "teclado mecánico", count: 9 },
];

const RECENT: SearchRow[] = [
  { q: "auricular razer" },
  { q: "notebook lenovo i5" },
  { q: "fuente 750w 80 plus" },
  { q: "ddr5 32gb" },
  { q: "ups 1500va" },
];

const SUGGESTIONS = [
  "Procesadores",
  "Placas de video",
  "SSD",
  "Memoria RAM",
  "Monitores",
  "Notebooks",
  "Periféricos",
  "UPS",
];

export default function PreviewPage() {
  return (
    <main className="lnd">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <p className="lnd-label">Propuesta · no está en producción</p>
        <h1 className="lnd-display lnd-display--lg mt-4">La card y la home</h1>

        <div className="lnd-body mt-8 max-w-2xl space-y-4">
          <p>
            Descarté la mesa de operaciones. La había armado asumiendo que el mismo producto se
            puede agrupar entre distribuidores, y no es cierto: los nombres no coinciden aunque sea
            el mismo artículo. Sin ese matching, esa pantalla compara cosas distintas.
          </p>
          <p>
            Así que acá van las dos cosas que sí pediste. Primero una vuelta sobre la tarjeta que ya
            existe, sin sacarle nada. Después la home del buscador, que es donde dijiste que podía
            innovar.
          </p>
        </div>

        {/* ---------------- CARD ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-24">1 · La tarjeta</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>
            No es un rediseño, es la misma tarjeta hablando el idioma de la landing. Está toda la
            información de hoy, incluidas las etiquetas de lo que el producto no tiene. Cuatro
            cambios:
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <b>Todo número va en la mono de la landing</b>, con cifras de ancho fijo. Es lo que
              deja leer una grilla de precios en columna en vez de renglón por renglón.
            </li>
            <li>
              <b>Las modalidades bajan de la foto al bloque de precio.</b> Offline y esquema
              modifican el precio, así que se leen con el precio y dejan de tapar el producto. Sobre
              la foto queda solo la baja, que es noticia.
            </li>
            <li>
              <b>Los dos botones auxiliares pasan a línea fina.</b> Hoy hay violeta, verde y el
              stepper compitiendo en una fila de tres centímetros. El único elemento pintado pasa a
              ser agregar al carrito.
            </li>
            <li>
              <b>Se suma el stock</b>, que el backend ya manda y la tarjeta no mostraba. Está en la
              página de producto y en la de proveedor, pero no acá, que es donde comprás.
            </li>
          </ol>
          <p>
            Lo que el producto no tiene sigue estando, pero en línea punteada y en voz baja: se lee
            si lo buscás y no compite con lo que sí hay.
          </p>
        </div>

        <div className="mt-10 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>
          <CardPass c={CARD} />
          <CardPass c={CARD_B} />
          <CardPass c={CARD_C} />
        </div>

        <p className="lnd-note mt-10">La misma tarjeta en el tema oscuro del sistema</p>
        <div
          className="pc-dark mt-4 grid gap-5 rounded-xl p-5"
          style={{ background: "#0e1018", gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}
        >
          <CardPass c={CARD} />
          <CardPass c={CARD_B} />
          <CardPass c={CARD_C} />
        </div>

        {/* ---------------- HOME ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-24">2 · La home del buscador</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>
            La de hoy abre con un carrusel de tres slides con degradé que le explican a alguien que
            entra todos los días qué hace el producto que ya compró, y que se mueve solo cada seis
            segundos. Debajo hay cuatro tarjetas de dashboard, y una de ellas dice <i>8 de 14</i> sin
            dejarte hacer nada con ese número.
          </p>
          <p>
            Acá el buscador es la página. El estado del sistema baja a una línea de texto. Y el{" "}
            <i>8 de 14</i> se convierte en el rail de proveedores: cada uno con su color, con cuándo
            sincronizó, y clickeable. Una lista vencida se ve acá en ámbar en vez de quedar escondida
            adentro de una cuenta, y los que no tienen credenciales están apagados al final.
          </p>
        </div>

        <div className="mt-10">
          <SearchHome providers={PROVIDERS} top={TOP} recent={RECENT} suggestions={SUGGESTIONS} />
        </div>

        <p className="lnd-note mt-16">
          Nada de esto toca producción. Decime qué queda y qué no y lo llevo al sistema detrás de un
          switch.
        </p>
      </div>
    </main>
  );
}
