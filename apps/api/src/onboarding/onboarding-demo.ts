/**
 * Catálogo y pedidos de demostración para comercios nuevos.
 *
 * Dos distribuidores ficticios (por lista) y cuatro productos con marcas y
 * categorías distintas, para que filtros, búsqueda y pedidos se puedan probar
 * sin credenciales reales ni sync de API.
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

export type DemoProductSeed = {
  provider: string;
  externalId: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  description: string;
  price: number;
  finalPrice: number;
  ivaPercent: number;
  stock: number;
  currency: string;
};

export const DEMO_PRODUCTS: DemoProductSeed[] = [
  {
    provider: "LIST_DEMO_NORTE",
    externalId: "DEMO-NB-MOUSE-001",
    sku: "LOGI-MX3S",
    name: "Mouse Logitech MX Master 3S Grafito",
    brand: "Logitech",
    category: "Periféricos",
    subcategory: "Mouse",
    description: "Producto de demostración. Silencioso, USB-C, para escritorio.",
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
    name: "Monitor Samsung Odyssey G5 27 pulgadas",
    brand: "Samsung",
    category: "Monitores",
    subcategory: "Gaming",
    description: "Producto de demostración. 165 Hz, curvatura 1000R.",
    price: 289.0,
    finalPrice: 289.0,
    ivaPercent: 21,
    stock: 8,
    currency: "USD",
  },
  {
    provider: "LIST_DEMO_SUR",
    externalId: "DEMO-SR-KB-010",
    sku: "RD-KUMARA-K552",
    name: "Teclado Mecánico Redragon Kumara K552",
    brand: "Redragon",
    category: "Periféricos",
    subcategory: "Teclado",
    description: "Producto de demostración. Switch Outemu Blue, RGB.",
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
    name: "SSD Kingston NV2 1TB M.2 NVMe",
    brand: "Kingston",
    category: "Almacenamiento",
    subcategory: "SSD",
    description: "Producto de demostración. PCIe 4.0, ideal para notebook.",
    price: 61.0,
    finalPrice: 61.0,
    ivaPercent: 10.5,
    stock: 15,
    currency: "USD",
  },
];

/** Consultas sugeridas en el recorrido para que el filtro y la búsqueda den resultado. */
export const DEMO_SEARCH_HINTS = ["monitor", "logitech", "ssd", "teclado"] as const;
