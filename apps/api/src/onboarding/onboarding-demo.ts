/**
 * Catálogo y pedidos de demostración para comercios nuevos.
 *
 * Dos distribuidores ficticios (por lista) y un set de productos con foto,
 * marca, categoría, part number y stock realistas — para que el onboarding
 * se sienta como el sistema en producción, no como un stub vacío.
 */

export const DEMO_DISTRIBUTORS = [
  {
    name: "Distribuidora Demo Norte",
    providerKey: "LIST_DEMO_NORTE",
    contactEmail: "ventas@demonorte.nodo.test",
  },
  {
    name: "Distribuidora Demo Sur",
    providerKey: "LIST_DEMO_SUR",
    contactEmail: "ventas@demosur.nodo.test",
  },
] as const;

const DEMO_PROVIDER_KEYS = new Set<string>(DEMO_DISTRIBUTORS.map((d) => d.providerKey));

/** Distros ficticios del recorrido: no son organizaciones reales de la plataforma. */
export function isDemoDistributorKey(key: string | null | undefined): boolean {
  return Boolean(key && DEMO_PROVIDER_KEYS.has(key));
}

/**
 * El catálogo Demo Norte/Sur solo existe mientras esa persona está en el
 * recorrido (alta, repaso o preview). Fuera de eso no aparecen ni en el
 * directorio ni en proveedores.
 */
export function viewerSeesDemoCatalog(user: {
  role: string;
  onboardingCompletedAt: Date | null;
  onboardingReplay: boolean;
  onboardingPreviewRestoreTenantId: string | null;
}): boolean {
  if (user.onboardingPreviewRestoreTenantId) return true;
  if (user.onboardingReplay) return true;
  if (user.role === "ROLE_ADMIN") return false;
  return !user.onboardingCompletedAt;
}

export type DemoProductSeed = {
  provider: string;
  externalId: string;
  sku: string;
  partNumber: string;
  ean: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  description: string;
  longDescription: string;
  imageUrl: string;
  warranty: string;
  price: number;
  finalPrice: number;
  ivaPercent: number;
  stock: number;
  currency: string;
};

/** Fotos Unsplash estables (mismo patrón que banners demo de la landing). */
const IMG = {
  mouse:
    "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&h=800&q=80",
  monitor:
    "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=800&h=800&q=80",
  keyboard:
    "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&h=800&q=80",
  ssd: "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=800&h=800&q=80",
  headset:
    "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=800&h=800&q=80",
  webcam:
    "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?auto=format&fit=crop&w=800&h=800&q=80",
  notebook:
    "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&h=800&q=80",
  router:
    "https://images.unsplash.com/photo-1606904825846-647eb07f5be2?auto=format&fit=crop&w=800&h=800&q=80",
  chair:
    "https://images.unsplash.com/photo-1580480055273-228ff5388bd8?auto=format&fit=crop&w=800&h=800&q=80",
  ups: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&h=800&q=80",
} as const;

export const DEMO_PRODUCTS: DemoProductSeed[] = [
  {
    provider: "LIST_DEMO_NORTE",
    externalId: "DEMO-NB-MOUSE-001",
    sku: "LOGI-MX3S",
    partNumber: "910-006559",
    ean: "097855165665",
    name: "Mouse Logitech MX Master 3S Grafito",
    brand: "Logitech",
    category: "Periféricos",
    subcategory: "Mouse",
    description: "Inalámbrico silencioso, MagSpeed, USB-C, multi-device.",
    longDescription:
      "Sensor 8K DPI, rueda MagSpeed electromagnética y clic silencioso. Conectá hasta 3 equipos por Bluetooth o Logi Bolt. Batería de hasta 70 días con una carga.",
    imageUrl: IMG.mouse,
    warranty: "12 meses",
    price: 98.5,
    finalPrice: 98.5,
    ivaPercent: 21,
    stock: 24,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_NORTE",
    externalId: "DEMO-NB-MON-027",
    sku: "SAM-ODYSSEY-27",
    partNumber: "LS27CG510ELXZS",
    ean: "8806094889017",
    name: "Monitor Samsung Odyssey G5 27 pulgadas",
    brand: "Samsung",
    category: "Monitores",
    subcategory: "Gaming",
    description: "QHD 165 Hz, VA curvo 1000R, FreeSync.",
    longDescription:
      "Panel VA 2560×1440, 1 ms MPRT, curvatura 1000R y AMD FreeSync. Ideal para gaming y diseño. Entradas HDMI y DisplayPort.",
    imageUrl: IMG.monitor,
    warranty: "24 meses",
    price: 289.0,
    finalPrice: 289.0,
    ivaPercent: 21,
    stock: 8,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_NORTE",
    externalId: "DEMO-NB-HS-400",
    sku: "LOGI-H390",
    partNumber: "981-000814",
    ean: "097855148446",
    name: "Auriculares Logitech H390 USB",
    brand: "Logitech",
    category: "Periféricos",
    subcategory: "Audio",
    description: "Stereo USB, micrófono con cancelación de ruido.",
    longDescription:
      "Conexión USB plug-and-play, controles en línea y almohadillas acolchadas. Micrófono abatible con filtro de ruido para llamadas y videollamadas.",
    imageUrl: IMG.headset,
    warranty: "12 meses",
    price: 34.9,
    finalPrice: 34.9,
    ivaPercent: 21,
    stock: 55,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_NORTE",
    externalId: "DEMO-NB-CAM-920",
    sku: "LOGI-C920s",
    partNumber: "960-001257",
    ean: "097855147968",
    name: "Webcam Logitech C920s HD Pro",
    brand: "Logitech",
    category: "Periféricos",
    subcategory: "Webcam",
    description: "Full HD 1080p, auto-focus, tapa de privacidad.",
    longDescription:
      "Video 1080p a 30 fps, micrófonos duales estereo y corrección de luz automática. Incluye tapa de privacidad y montaje universal.",
    imageUrl: IMG.webcam,
    warranty: "12 meses",
    price: 69.0,
    finalPrice: 69.0,
    ivaPercent: 21,
    stock: 18,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_NORTE",
    externalId: "DEMO-NB-NB-I5",
    sku: "LEN-V15-G3",
    partNumber: "82TT0009AR",
    ean: "196802789012",
    name: "Notebook Lenovo V15 G3 Intel i5 8GB 512SSD",
    brand: "Lenovo",
    category: "Notebooks",
    subcategory: "Oficina",
    description: "15.6\" FHD, i5-1235U, 8 GB RAM, SSD 512 GB.",
    longDescription:
      "Pantalla Full HD antideslumbrante, teclado numérico y puertos USB-C / HDMI. Pensada para oficina y estudio, con Windows preinstalado.",
    imageUrl: IMG.notebook,
    warranty: "12 meses on-site",
    price: 620.0,
    finalPrice: 620.0,
    ivaPercent: 21,
    stock: 6,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_SUR",
    externalId: "DEMO-SR-KB-010",
    sku: "RD-KUMARA-K552",
    partNumber: "K552-RGB",
    ean: "6957389001234",
    name: "Teclado Mecánico Redragon Kumara K552",
    brand: "Redragon",
    category: "Periféricos",
    subcategory: "Teclado",
    description: "Tenkeyless, Outemu Blue, RGB, cable USB.",
    longDescription:
      "Formato TKL compacto, switches Outemu Blue clicky, iluminación RGB por tecla y estructura metálica. Ideal para gaming y escritura.",
    imageUrl: IMG.keyboard,
    warranty: "12 meses",
    price: 42.9,
    finalPrice: 42.9,
    ivaPercent: 21,
    stock: 40,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_SUR",
    externalId: "DEMO-SR-SSD-1T",
    sku: "KING-NV2-1TB",
    partNumber: "SNV2S/1000G",
    ean: "740617323456",
    name: "SSD Kingston NV2 1TB M.2 NVMe",
    brand: "Kingston",
    category: "Almacenamiento",
    subcategory: "SSD",
    description: "PCIe 4.0 NVMe, hasta 3500 MB/s lectura.",
    longDescription:
      "Formato M.2 2280, interfaz PCIe 4.0 x4. Ideal para upgrade de notebooks y PCs. Bajo consumo y sin piezas móviles.",
    imageUrl: IMG.ssd,
    warranty: "36 meses",
    price: 61.0,
    finalPrice: 61.0,
    ivaPercent: 10.5,
    stock: 15,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_SUR",
    externalId: "DEMO-SR-RTR-AX",
    sku: "TP-AX1800",
    partNumber: "Archer AX23",
    ean: "4897098689012",
    name: "Router TP-Link Archer AX23 Wi-Fi 6",
    brand: "TP-Link",
    category: "Redes",
    subcategory: "Router",
    description: "Wi-Fi 6 AX1800, 4 antenas, OFDMA.",
    longDescription:
      "Doble banda hasta 1800 Mbps, 4 antenas externas y app Tether. Compatible con ISP fibra y cable. 4 puertos Gigabit LAN.",
    imageUrl: IMG.router,
    warranty: "24 meses",
    price: 54.0,
    finalPrice: 54.0,
    ivaPercent: 21,
    stock: 22,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_SUR",
    externalId: "DEMO-SR-CHAIR-01",
    sku: "NB-ERGON-BK",
    partNumber: "ERG-2024-BK",
    ean: "7798123456789",
    name: "Silla Ergonómica Nodo Pro Negra",
    brand: "Nodo Home",
    category: "Mobiliario",
    subcategory: "Sillas",
    description: "Lumbar ajustable, apoyabrazos 2D, base nylon.",
    longDescription:
      "Respaldo de malla transpirable, soporte lumbar regulable y ruedas silenciosas. Capacidad 120 kg. Montaje simple.",
    imageUrl: IMG.chair,
    warranty: "24 meses",
    price: 189.0,
    finalPrice: 189.0,
    ivaPercent: 21,
    stock: 11,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_SUR",
    externalId: "DEMO-SR-UPS-1K",
    sku: "APC-BV1000",
    partNumber: "BV1000M1-AR",
    ean: "731304345678",
    name: "UPS APC Easy UPS 1000VA",
    brand: "APC",
    category: "Energía",
    subcategory: "UPS",
    description: "1000 VA / 600 W, AVR, 4 tomas con batería.",
    longDescription:
      "Protección contra cortes y picos, regulador AVR y software de monitoreo. Ideal para PCs de escritorio y routers.",
    imageUrl: IMG.ups,
    warranty: "24 meses",
    price: 112.0,
    finalPrice: 112.0,
    ivaPercent: 21,
    stock: 9,
    currency: "USD",
  },
];

/** Consultas sugeridas en el recorrido para que el filtro y la búsqueda den resultado. */
export const DEMO_SEARCH_HINTS = ["monitor", "logitech", "ssd", "teclado", "notebook", "router"] as const;

export function demoProductBySku(sku: string): DemoProductSeed {
  const found = DEMO_PRODUCTS.find((p) => p.sku === sku);
  if (!found) throw new Error(`Demo product missing: ${sku}`);
  return found;
}

export function isDemoOrderNote(notes: string | null | undefined): boolean {
  return Boolean(notes && notes.includes("[DEMO]"));
}
