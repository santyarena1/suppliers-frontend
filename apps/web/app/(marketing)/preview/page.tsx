import type { Metadata } from "next";
import CardPass, { type PassCard } from "@/components/system/CardPass";
import { HomeInicio, SearchEmpty, type DropRow, type ProvState, type SearchRow } from "@/components/system/Homes";
import ProductPass, { type ProductPassData } from "@/components/system/ProductPass";
import "../landing.css";
import "../preview.css";
import "../preview-system.css";

export const metadata: Metadata = {
  title: "NODO — Propuesta de sistema",
  robots: { index: false, follow: false },
};

/* Silueta neutra: no uso una foto ajena para maquetar. */
const shot = (body: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>${body}</svg>`);

const HEADSET = shot(
  "<g fill='none' stroke='#aab2c4' stroke-width='4' stroke-linecap='round'><path d='M28 70V56a32 32 0 0 1 64 0v14'/><rect x='18' y='66' width='18' height='30' rx='9' fill='#cbd2e0' stroke='none'/><rect x='84' y='66' width='18' height='30' rx='9' fill='#cbd2e0' stroke='none'/><path d='M30 96v6a10 10 0 0 0 10 10h10'/></g>",
);
const CHIP = shot(
  "<g fill='none' stroke='#aab2c4' stroke-width='4'><rect x='34' y='34' width='52' height='52' rx='5' fill='#cbd2e0' stroke='none'/><rect x='46' y='46' width='28' height='28' rx='3' fill='#aab2c4' stroke='none'/><g stroke-linecap='round'><path d='M44 34V22M60 34V22M76 34V22M44 98V86M60 98V86M76 98V86M34 44H22M34 60H22M34 76H22M98 44H86M98 60H86M98 76H86'/></g></g>",
);
const SSD = shot(
  "<g><rect x='24' y='44' width='72' height='32' rx='4' fill='#cbd2e0'/><rect x='32' y='52' width='30' height='16' rx='2' fill='#aab2c4'/><rect x='70' y='54' width='18' height='4' rx='2' fill='#aab2c4'/><rect x='70' y='62' width='12' height='4' rx='2' fill='#aab2c4'/></g>",
);

/* ============================================================
 * TARJETAS · la misma tarjeta en las dos monedas
 * ========================================================== */

const ARS_CARDS: PassCard[] = [
  {
    provider: "New Bytes",
    providerColor: "#0284c7",
    name: "AURICULAR RAZER BLACKSHARK V3 PRO WHITE HYPERSPEED WIRELESS+BT ANC THX",
    brand: "RAZER",
    category: "Auriculares",
    imageUrl: HEADSET,
    price: "$ 402.409",
    breakdown: "Base $ 364.171 · IVA 10,5%",
    breakdownTitle: "Precio con IVA, sin percepciones",
    stock: 12,
    offline: "off",
    scheme: "off",
    externalId: "121495",
    syncedAt: "Actualizado 7/9/26, 11:40 a. m.",
  },
  {
    provider: "Elit",
    providerColor: "#a855f7",
    name: "PROCESADOR AMD RYZEN 5 5600 3.5GHZ AM4 SIN VIDEO",
    brand: "AMD",
    category: "Procesadores",
    imageUrl: CHIP,
    price: "$ 182.640",
    previousPrice: "$ 194.310",
    dropPercent: 6,
    breakdown: "Base $ 145.512 · IVA 21% · IIBB 3,5%",
    breakdownTitle: "Precio con IVA y percepciones",
    stock: 96,
    offline: "on",
    scheme: null,
    location: "Depósito Buenos Aires",
    externalId: "AMD5600",
    syncedAt: "Actualizado 7/9/26, 11:38 a. m.",
  },
  {
    provider: "Air",
    providerColor: "#10b981",
    name: "SSD KINGSTON NV3 1TB NVME M.2 2280 PCIE 4.0 7000MB/S",
    brand: "Kingston",
    category: "Almacenamiento",
    imageUrl: SSD,
    imageAiSelected: true,
    price: "$ 95.014",
    breakdown: "Base $ 78.520 · IVA 21%",
    schemeHint: "Esquema $ 91.494 (−3,7%)",
    stock: 0,
    offline: "off",
    scheme: "on",
    externalId: "SSD1T8G4",
    syncedAt: "Actualizado 7/9/26, 09:12 a. m.",
    listOverdue: "lista de ayer",
  },
];

/* La misma tarjeta con la preferencia en USD: cambia todo, no solo el numero
   grande. No queda ni un peso a la vista. */
const USD_CARDS: PassCard[] = [
  { ...ARS_CARDS[0], price: "US$ 263,01", breakdown: "Base US$ 238,02 · IVA 10,5%" },
  {
    ...ARS_CARDS[1],
    price: "US$ 119,37",
    previousPrice: "US$ 127,00",
    breakdown: "Base US$ 95,11 · IVA 21% · IIBB 3,5%",
  },
  {
    ...ARS_CARDS[2],
    price: "US$ 62,10",
    breakdown: "Base US$ 51,32 · IVA 21%",
    schemeHint: "Esquema US$ 59,80 (−3,7%)",
  },
];

/* ============================================================
 * INICIO Y BUSQUEDA
 * ========================================================== */

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

const DROPS: DropRow[] = [
  {
    name: "PROCESADOR AMD RYZEN 5 5600 3.5GHZ AM4",
    provider: "Elit",
    color: "#a855f7",
    price: "$ 182.640",
    previous: "$ 194.310",
    drop: 6,
  },
  {
    name: "PLACA DE VIDEO ASUS DUAL RTX 4060 8GB",
    provider: "Grupo Núcleo",
    color: "#10b981",
    price: "$ 454.655",
    previous: "$ 478.584",
    drop: 5,
  },
  {
    name: "MONITOR SAMSUNG ODYSSEY G5 27 165HZ",
    provider: "New Bytes",
    color: "#0284c7",
    price: "$ 388.220",
    previous: "$ 420.150",
    drop: 8,
  },
  {
    name: "NOTEBOOK LENOVO IDEAPAD 3 I5 16GB 512GB",
    provider: "Air",
    color: "#06b6d4",
    price: "$ 1.104.900",
    previous: "$ 1.152.400",
    drop: 4,
  },
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
];

const CATEGORIES = [
  "Procesadores",
  "Placas de video",
  "SSD",
  "Memoria RAM",
  "Monitores",
  "Notebooks",
  "Periféricos",
  "UPS",
];

/* ============================================================
 * PAGINA DE PRODUCTO
 * ========================================================== */

const PRODUCT: ProductPassData = {
  provider: "New Bytes",
  providerColor: "#0284c7",
  brand: "RAZER",
  category: "Periféricos",
  subcategory: "Auriculares",
  externalId: "121495",
  name: "AURICULAR RAZER BLACKSHARK V3 PRO WHITE HYPERSPEED WIRELESS+BT ANC THX",
  imageUrl: HEADSET,
  stock: 12,
  stockStatus: "Disponible",
  priceCaption: "Costo final con IVA, sin percepciones",
  price: "$ 402.409",
  previousPrice: "$ 428.096",
  dropPercent: 6,
  rows: [
    { label: "Costo del distribuidor", value: "$ 364.171" },
    { label: "IVA 10,5%", value: "+ $ 38.238", kind: "add" },
    { label: "Percepciones", value: "no aplicadas", kind: "muted" },
    { label: "Costo unitario final", value: "$ 402.409", kind: "total" },
  ],
  originNote:
    "El distribuidor publica US$ 238,02. Convertido con dólar oficial 1.530,00 del 7/9/26. Cambiá la moneda o la cotización en preferencias y toda la página se recalcula.",
  description:
    "Auricular inalámbrico profesional con triple modo de conexión: HyperSpeed Wireless de 2,4 GHz, Bluetooth y cable USB-C. Cancelación activa de ruido, certificación THX Spatial Audio y micrófono desmontable HyperClear con supresión de ruido de fondo.",
  facts: [
    { k: "Marca", v: "Razer" },
    { k: "Part number", v: "RZ04-04910100-R3U1" },
    { k: "EAN", v: "8886419385110" },
    { k: "Garantía", v: "12 meses" },
    { k: "Peso", v: "320 g" },
    { k: "Conectividad", v: "2.4 GHz · BT · USB-C" },
    { k: "Categoría", v: "Periféricos" },
    { k: "Código interno", v: "#121495" },
  ],
  history: [428096, 428096, 419500, 419500, 410200, 402409, 402409],
  related: [
    { name: "AURICULAR RAZER BLACKSHARK V3 BLACK", provider: "Elit", color: "#a855f7", price: "$ 318.900" },
    { name: "AURICULAR LOGITECH G PRO X 2 LIGHTSPEED", provider: "Air", color: "#06b6d4", price: "$ 386.400" },
    { name: "AURICULAR HYPERX CLOUD III WIRELESS", provider: "Invid", color: "#14b8a6", price: "$ 241.700" },
    { name: "AURICULAR STEELSERIES ARCTIS NOVA 7", provider: "GC", color: "#f97316", price: "$ 355.100" },
  ],
  syncedAt: "Actualizado 7/9/26, 11:40 a. m. · New Bytes sincroniza cada 15 minutos",
};

export default function PreviewPage() {
  return (
    <main className="lnd">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <p className="lnd-label">Propuesta · no está en producción</p>
        <h1 className="lnd-display lnd-display--lg mt-4">Tarjeta, inicio, búsqueda y producto</h1>

        <div className="lnd-body mt-8 max-w-2xl space-y-4">
          <p>
            Tres cosas que me pediste: la tarjeta siempre en claro, una sola moneda en todo el
            detalle, y separar las dos pantallas que yo había mezclado en una. Va también la página
            de producto con el mismo idioma.
          </p>
        </div>

        {/* ---------------- 1. TARJETA ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-24">1 · La tarjeta</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>
            La regla de una sola moneda obliga a repensar qué dice, porque hoy hay dos cosas que
            están fijas en dólares:
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <b>La línea secundaria es la otra moneda.</b> Si mostrás en ARS, hoy debajo del precio
              aparece el mismo importe en USD. Con tu regla eso se va, y sacarlo libera un renglón
              entero.
            </li>
            <li>
              <b>&quot;Base US$ 238,02 · s/imp&quot; estaba siempre en dólares.</b> Pasa a la moneda
              elegida, y de paso se come la pastilla de impuesto, que decía lo mismo con otras
              palabras. Queda un solo renglón que explica de dónde sale el número grande:{" "}
              <span className="lnd-mono">Base $ 364.171 · IVA 10,5%</span>.
            </li>
          </ol>
          <p>
            El resto queda como te gustó: números en la mono, modalidades abajo con el precio,
            botones auxiliares en línea fina, stock agregado, y siempre en claro aunque el sistema
            esté en oscuro. Queda como un objeto de papel apoyado sobre el fondo.
          </p>
        </div>

        <p className="lnd-note mt-10">Preferencia en ARS</p>
        <div className="mt-3 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>
          {ARS_CARDS.map((c) => (
            <CardPass key={c.externalId} c={c} />
          ))}
        </div>

        <p className="lnd-note mt-10">
          La misma tarjeta con la preferencia en USD: no queda un peso a la vista
        </p>
        <div className="mt-3 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>
          {USD_CARDS.map((c) => (
            <CardPass key={c.externalId} c={c} />
          ))}
        </div>

        {/* ---------------- 2. INICIO ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-24">2 · Módulo Inicio</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>
            Tenías razón: lo que te mostré antes era una sola pantalla haciendo dos trabajos. Inicio
            es donde entrás a la mañana, así que su trabajo es decirte qué cambió desde ayer, no
            invitarte a buscar.
          </p>
          <p>
            Arranca con las bajas de precio desde la última sincronización, que es la razón real para
            abrir la app todos los días y que el backend ya calcula. Después el estado de tus
            proveedores, donde el <i>8 de 14</i> se vuelve tocable y una lista vencida se ve en ámbar
            en vez de quedar escondida adentro de una cuenta. Al final, volver a tus búsquedas.
          </p>
          <p>
            Se va el carrusel de tres slides con degradé que le explica el producto a alguien que ya
            lo compró y que se mueve solo cada seis segundos, y se van las cuatro tarjetas de
            dashboard: eso baja a una línea de texto arriba de todo.
          </p>
        </div>

        <div className="mt-10">
          <HomeInicio providers={PROVIDERS} drops={DROPS} top={TOP} />
        </div>

        {/* ---------------- 3. BÚSQUEDA VACÍA ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-24">3 · Búsqueda sin consulta</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>
            Acá ya estás adentro del módulo de búsqueda y todavía no escribiste nada. No va nada del
            estado del sistema: eso ya lo viste en Inicio y repetirlo es ruido. Va el campo, y solo
            lo que te ayuda a escribir la consulta.
          </p>
        </div>

        <div className="mt-10">
          <SearchEmpty recent={RECENT} categories={CATEGORIES} />
        </div>

        {/* ---------------- 4. PRODUCTO ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-24">4 · Página de producto</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>
            Está todo lo que hay hoy: identidad, stock, foto con zoom, panel de precio con desglose,
            cantidad, acciones, similares, descripción, ficha técnica, evolución de precio,
            relacionados, última sincronización y el pie de locales.
          </p>
          <p>
            El cambio de fondo es el desglose. Hoy mezcla monedas en cuatro renglones: &quot;Precio
            de lista (USD)&quot;, &quot;Cotización&quot;, &quot;Costo en ARS&quot;. Con tu regla cada
            renglón va en la moneda elegida y suma hasta el total.
          </p>
          <p>
            <b>Una decisión que quiero que confirmes:</b> el origen en dólares no lo borré, lo bajé a
            una nota al pie del panel. En la tarjeta sacarlo está bien porque ahí comparás; en la
            página de producto el precio de lista del distribuidor y la cotización usada son la
            explicación de cómo se llegó al número, y esconderlas del todo me parece perder algo
            real. Si querés que desaparezcan también acá, lo saco.
          </p>
        </div>

        <div className="mt-10">
          <ProductPass p={PRODUCT} />
        </div>

        <p className="lnd-note mt-16">
          Nada de esto toca producción. Decime qué queda y qué no y lo llevo al sistema detrás de un
          switch.
        </p>
      </div>
    </main>
  );
}
