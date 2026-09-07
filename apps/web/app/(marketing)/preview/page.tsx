import type { Metadata } from "next";
import CardPass, { type PassCard } from "@/components/system/CardPass";
import {
  HomeInicio,
  SearchEmpty,
  type AdBanner,
  type ProvState,
  type SearchRow,
} from "@/components/system/Homes";
import ProductPass, { type ProductPassData } from "@/components/system/ProductPass";
import "../landing.css";
import "../preview.css";
import "../preview-system.css";
import "../preview-search.css";

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
const GPU = shot(
  "<g><rect x='16' y='40' width='88' height='40' rx='4' fill='#cbd2e0'/><circle cx='42' cy='60' r='13' fill='#aab2c4'/><circle cx='78' cy='60' r='13' fill='#aab2c4'/><rect x='16' y='80' width='30' height='6' rx='2' fill='#aab2c4'/></g>",
);
const MON = shot(
  "<g><rect x='16' y='28' width='88' height='54' rx='4' fill='#cbd2e0'/><rect x='24' y='36' width='72' height='38' rx='2' fill='#aab2c4'/><rect x='50' y='84' width='20' height='10' fill='#cbd2e0'/><rect x='36' y='94' width='48' height='6' rx='3' fill='#cbd2e0'/></g>",
);

/* ============================================================
 * TARJETAS
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
  {
    provider: "Grupo Núcleo",
    providerColor: "#10b981",
    name: "PLACA DE VIDEO ASUS DUAL GEFORCE RTX 4060 8GB GDDR6 OC",
    brand: "ASUS",
    category: "Placas de video",
    imageUrl: GPU,
    price: "$ 454.655",
    previousPrice: "$ 478.584",
    dropPercent: 5,
    breakdown: "Base $ 375.748 · IVA 21%",
    missingIva: true,
    stock: 4,
    offline: "on",
    scheme: "on",
    externalId: "DUAL-RTX4060-O8G",
    syncedAt: "Actualizado 7/9/26, 11:31 a. m.",
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
  {
    ...ARS_CARDS[3],
    price: "US$ 297,16",
    previousPrice: "US$ 312,80",
    breakdown: "Base US$ 245,59 · IVA 21%",
  },
];

/* ============================================================
 * INICIO
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
 * BUSQUEDA SIN CONSULTA
 * ========================================================== */

const BANNERS: AdBanner[] = [
  {
    title: "Campaña destacada",
    subtitle: "Espacio principal del bento, imagen a sangre",
    tone: "#4033fc",
    kind: "propio",
    span: "hero",
  },
  { title: "Marca aliada", subtitle: "Slot secundario", tone: "#ff6a3d", kind: "patrocinado", span: "unit" },
  { title: "Lanzamiento", subtitle: "Slot secundario", tone: "#0284c7", kind: "patrocinado", span: "unit" },
  { title: "Promo del distribuidor", subtitle: "Slot ancho", tone: "#10b981", kind: "demo", span: "wide" },
  { title: "Combo del mes", subtitle: "Slot unitario", tone: "#a855f7", kind: "demo", span: "unit" },
  { title: "Financiación", subtitle: "Slot unitario", tone: "#eab308", kind: "propio", span: "unit" },
];

const PARTNERS = ["AMD", "ASUS", "Kingston", "Logitech", "Razer", "Samsung", "Seagate", "TP-Link"];

const DROPS: PassCard[] = [
  ARS_CARDS[1],
  ARS_CARDS[3],
  {
    ...ARS_CARDS[0],
    provider: "New Bytes",
    name: "MONITOR SAMSUNG ODYSSEY G5 27 2K 165HZ CURVO",
    brand: "Samsung",
    category: "Monitores",
    imageUrl: MON,
    price: "$ 388.220",
    previousPrice: "$ 420.150",
    dropPercent: 8,
    breakdown: "Base $ 320.843 · IVA 21%",
    stock: 7,
    offline: "on",
    scheme: "off",
    externalId: "LS27CG552",
    syncedAt: "Actualizado 7/9/26, 11:40 a. m.",
  },
  {
    ...ARS_CARDS[2],
    provider: "Invid",
    providerColor: "#14b8a6",
    name: "SSD SEAGATE BARRACUDA Q5 2TB NVME M.2 2280",
    brand: "Seagate",
    category: "Almacenamiento",
    imageUrl: SSD,
    imageAiSelected: false,
    price: "$ 168.930",
    previousPrice: "$ 179.500",
    dropPercent: 6,
    breakdown: "Base $ 139.612 · IVA 21%",
    schemeHint: undefined,
    stock: 23,
    offline: "off",
    scheme: "off",
    externalId: "ZP2000CV3A001",
    syncedAt: "Actualizado 7/9/26, 10:58 a. m.",
    listOverdue: undefined,
  },
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
  priceCaption: "Costo final en lista, con IVA",
  price: "$ 402.409",
  previousPrice: "$ 428.096",
  previousAt: "6/9/26",
  dropPercent: 6,
  currency: "$",
  modes: [
    {
      key: "lista",
      name: "Lista",
      caption: "Precio publicado por el distribuidor",
      available: true,
      rows: [
        { label: "Costo del distribuidor", value: "$ 364.171" },
        { label: "IVA 10,5%", value: "+ $ 38.238", kind: "add" },
        { label: "Percepciones", value: "no aplicadas", kind: "muted" },
      ],
      total: "$ 402.409",
    },
    {
      key: "offline",
      name: "Offline",
      caption: "Pago fuera de factura, sin percepciones",
      available: true,
      rows: [
        { label: "Costo del distribuidor", value: "$ 364.171" },
        { label: "Descuento offline 4%", value: "− $ 14.567", kind: "add" },
        { label: "IVA", value: "no se aplica", kind: "muted" },
        { label: "Percepciones", value: "no se aplican", kind: "muted" },
      ],
      total: "$ 349.604",
      vsList: "−$ 52.805 vs lista",
    },
    {
      key: "esquema",
      name: "Esquema",
      caption: "IVA ajustado por acuerdo con el distribuidor",
      available: false,
      unavailableNote:
        "New Bytes no acepta esquema. Si empieza a aceptarlo, cargalo en Configuración del proveedor y esta columna se completa sola.",
    },
  ],
  description:
    "Auricular inalámbrico profesional con triple modo de conexión: HyperSpeed Wireless de 2,4 GHz, Bluetooth y cable USB-C. Cancelación activa de ruido, certificación THX Spatial Audio y micrófono desmontable HyperClear con supresión de ruido de fondo.",
  facts: [
    { k: "Marca", v: "Razer" },
    { k: "Part number", v: "RZ04-04910100-R3U1" },
    { k: "EAN", v: "8886419385110" },
    { k: "Garantía", v: "12 meses" },
    { k: "Peso", v: "320 g" },
    { k: "Conectividad", v: "2.4 GHz · BT · USB-C" },
    { k: "Categoría", v: "Periféricos · Auriculares" },
    { k: "Código interno", v: "#121495" },
  ],
  history: [
    { date: "8/8", value: 428096 },
    { date: "14/8", value: 428096 },
    { date: "20/8", value: 419500 },
    { date: "26/8", value: 431200 },
    { date: "1/9", value: 419500 },
    { date: "6/9", value: 428096 },
    { date: "7/9", value: 402409 },
  ],
  related: [
    { name: "AURICULAR RAZER BLACKSHARK V3 BLACK", provider: "Elit", color: "#a855f7", price: "$ 318.900" },
    { name: "AURICULAR LOGITECH G PRO X 2 LIGHTSPEED", provider: "Air", color: "#06b6d4", price: "$ 386.400" },
    { name: "AURICULAR HYPERX CLOUD III WIRELESS", provider: "Invid", color: "#14b8a6", price: "$ 241.700" },
    { name: "AURICULAR STEELSERIES ARCTIS NOVA 7", provider: "GC", color: "#f97316", price: "$ 355.100" },
  ],
  syncedAt: "Actualizado 7/9/26, 11:40 a. m. · New Bytes sincroniza cada 15 minutos",
  locales: {
    rows: [
      { shop: "Compra Gamer", price: "$ 589.999", margin: "+46%", marginTone: "up" },
      { shop: "Mercado Libre (promedio)", price: "$ 561.400", margin: "+40%", marginTone: "up" },
      { shop: "Venex", price: "$ 574.900", margin: "+43%", marginTone: "up" },
      { shop: "Full H4rd", price: "$ 549.000", margin: "+36%", marginTone: "up" },
      { shop: "Maximus Gaming", price: "$ 396.000", margin: "−2%", marginTone: "down" },
      { shop: "Gaming City", price: "$ 612.000", margin: "+52%", marginTone: "up" },
    ],
    note: "Margen calculado sobre tu costo neto de lista. Referencia de mercado tomada hoy; no incluye envío ni financiación de cada local.",
  },
};

export default function PreviewPage() {
  return (
    <main className="lnd">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <p className="lnd-label">Propuesta · no está en producción</p>
        <h1 className="lnd-display lnd-display--lg mt-4">Tarjeta, inicio, búsqueda y producto</h1>

        {/* ---------------- 1. TARJETA ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-20">1 · La tarjeta</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>
            Ahora la tarjeta es una retícula fija: cada dato tiene su renglón y lo ocupa siempre,
            tenga o no contenido. Un producto sin aviso de esquema deja ese renglón vacío en vez de
            subir todo lo de abajo. En una grilla de veinte, todos los precios quedan a la misma
            altura y todos los stocks juntos.
          </p>
          <p>
            Por eso la marca de imagen automática pasó a ser un sello sobre la foto: era la única
            cosa que empujaba el cuerpo entero hacia abajo. Ahí aparece y desaparece sin mover nada,
            que es justo lo que pediste.
          </p>
          <p>
            También le puse nombre al precio tachado: ahora dice{" "}
            <span className="lnd-mono">antes $ 194.310</span>, porque un número tachado sin etiqueta
            no se entiende.
          </p>
        </div>

        <p className="lnd-note mt-10">Preferencia en ARS · cuatro productos con datos distintos, todo alineado</p>
        <div className="mt-3 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14.5rem, 1fr))" }}>
          {ARS_CARDS.map((c) => (
            <CardPass key={c.externalId} c={c} />
          ))}
        </div>

        <p className="lnd-note mt-10">Los mismos, con la preferencia en USD</p>
        <div className="mt-3 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14.5rem, 1fr))" }}>
          {USD_CARDS.map((c) => (
            <CardPass key={c.externalId} c={c} />
          ))}
        </div>

        {/* ---------------- 2. INICIO ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-24">2 · Módulo Inicio</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>Como pediste, vuelve tal cual estaba la vez anterior.</p>
        </div>

        <div className="mt-10">
          <HomeInicio providers={PROVIDERS} top={TOP} recent={RECENT} categories={CATEGORIES} />
        </div>

        {/* ---------------- 3. BÚSQUEDA VACÍA ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-24">3 · Búsqueda sin consulta</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>
            Acá me faltaba mirar qué había: los espacios de publicidad en bento con sus etiquetas de
            propio, patrocinado y demo; el carrusel de marcas; y la grilla de bajas de precio. Está
            todo, no saqué nada.
          </p>
          <p>
            Lo que sumé arriba es lo que ayuda a arrancar cuando todavía no escribiste: categorías,
            tus últimas búsquedas y el consejo de buscar por part number, que es lo único que todos
            los distribuidores escriben igual.
          </p>
        </div>

        <div className="mt-10">
          <SearchEmpty
            banners={BANNERS}
            partners={PARTNERS}
            drops={DROPS}
            recent={RECENT}
            categories={CATEGORIES}
          />
        </div>

        {/* ---------------- 4. PRODUCTO ---------------- */}
        <h2 className="lnd-display lnd-display--md mt-24">4 · Página de producto</h2>
        <div className="lnd-body mt-4 max-w-2xl space-y-4">
          <p>Cinco cambios sobre lo que te mostré:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <b>El título usa el ancho completo.</b> Lo tenía apretado a 32 caracteres sin ninguna
              razón.
            </li>
            <li>
              <b>Saqué el texto de la cotización.</b> Ese renglón explicativo no va.
            </li>
            <li>
              <b>En su lugar, el desglose por modalidad.</b> Lista, offline y esquema, cada una con
              sus renglones, su total y la diferencia contra lista. Es la pregunta real que te hacés
              parado en el producto. Cuando el distribuidor no acepta una modalidad, la columna lo
              dice y explica dónde se habilita, en vez de desaparecer.
            </li>
            <li>
              <b>El precio tachado ahora tiene nombre.</b> Dice{" "}
              <span className="lnd-mono">Antes $ 428.096 · sync del 6/9/26 · bajó 6%</span>. Antes
              era un número tachado sin explicación.
            </li>
            <li>
              <b>Los locales vienen cargados</b>, con el precio de cada uno y tu margen contra el
              costo neto. Ya no hay botón de &quot;ver comparativa&quot;.
            </li>
          </ol>
          <p>
            Y el gráfico ahora tiene referencias: máximo, mínimo, valor de hoy y variación a 30
            días, con la escala a la derecha y las fechas abajo. Se ve dónde estás parado dentro del
            recorrido del precio, no solo que sube o baja.
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
