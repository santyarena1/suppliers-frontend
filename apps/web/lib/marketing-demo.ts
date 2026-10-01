/**
 * Datos de las demos de la landing. Los productos y códigos son reales; las
 * fotos de ADATA salen del catálogo de NODO y las de ASUS y GIGABYTE son las
 * oficiales del fabricante (Open Icecat), guardadas en /public/landing/products.
 * Los distribuidores van sin nombre y los precios son de
 * ejemplo: la landing no compara ni recomienda distribuidores ni marcas, porque
 * NODO también es para ellos.
 */
const API = "https://api-production-f4aa.up.railway.app";

export interface DemoProduct {
  name: string;
  brand: string;
  category: string;
  code: string;
  image: string;
  distributor: string;
  stock: number;
  /** Neto de lista, USD, ejemplo. */
  net: number;
  iva: number;
  updated: string;
}

export const SEARCH_QUERY = "memoria adata";

export const SEARCH_RESULTS: DemoProduct[] = [
  {
    name: "ADATA DIMM 16GB DDR4 3200MHz",
    brand: "ADATA",
    category: "Memorias",
    code: "AD4U320016G22-SGN",
    image: `${API}/assets/9b2b436c-cf67-444d-b7fd-66f63cffc000`,
    distributor: "Distribuidor 2",
    stock: 44,
    net: 27.6,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
  {
    name: "ADATA SODIMM 16GB DDR5 5600MHz",
    brand: "ADATA",
    category: "Memorias",
    code: "AD5S560016G-S",
    image: "https://static.nb.com.ar/i/nb_MEMORIA-ADATA-SODIMM-DDR5-16GB-5600_ver_89989cccaa0c755e64721392175f7510.jpg",
    distributor: "Distribuidor 4",
    stock: 12,
    net: 43.5,
    iva: 10.5,
    updated: "Actualizado hoy, 8:05",
  },
  {
    name: "ADATA DIMM 16GB DDR5 5600MHz",
    brand: "ADATA",
    category: "Memorias",
    code: "AD5U560016G-S",
    image: `${API}/assets/3cf09f70-ce41-465b-b189-828a864e1f48`,
    distributor: "Distribuidor 1",
    stock: 80,
    net: 41.2,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
  {
    name: "ADATA SODIMM 16GB DDR4 3200MHz",
    brand: "ADATA",
    category: "Memorias",
    code: "AD4S320016G22-SGN",
    image: "https://static.nb.com.ar/i/nb_MEMORIA-ADATA-SODIMM-DDR4-16GB-3200-G22-SGN_ver_b4f9745cc70e4a70c17ff563e040a564.jpg",
    distributor: "Distribuidor 3",
    stock: 26,
    net: 28.4,
    iva: 10.5,
    updated: "Actualizado hoy, 7:50",
  },
  {
    name: "ADATA DIMM 8GB DDR5 5600MHz",
    brand: "ADATA",
    category: "Memorias",
    code: "AD5U56008G-S",
    image: `${API}/assets/18ab6a10-afe6-4869-a0d5-3ca05eb8c3ff`,
    distributor: "Distribuidor 2",
    stock: 120,
    net: 24.8,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
  {
    name: "ADATA SODIMM 8GB DDR4 3200MHz",
    brand: "ADATA",
    category: "Memorias",
    code: "AD4S32008G22-SGN",
    image: `${API}/assets/374937f1-fce4-48fd-88d1-52964934bc38`,
    distributor: "Distribuidor 1",
    stock: 15,
    net: 14.9,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
];

const ASUS_MONITORS: DemoProduct[] = [
  {
    name: 'ASUS TUF Gaming VG249Q1A 23,8" 165Hz',
    brand: "ASUS",
    category: "Monitores",
    code: "90LM06J1-B01170",
    image: "/landing/products/asus-vg249q1a.jpg",
    distributor: "Distribuidor 1",
    stock: 34,
    net: 132.4,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
  {
    name: 'ASUS VA24EHE 23,8" IPS 75Hz',
    brand: "ASUS",
    category: "Monitores",
    code: "90LM0560-B01170",
    image: "/landing/products/asus-va24ehe.jpg",
    distributor: "Distribuidor 3",
    stock: 58,
    net: 97.9,
    iva: 10.5,
    updated: "Actualizado hoy, 7:50",
  },
  {
    name: 'ASUS TUF Gaming VG27AQ 27" QHD 165Hz',
    brand: "ASUS",
    category: "Monitores",
    code: "90LM0500-B01370",
    image: "/landing/products/asus-vg27aq.jpg",
    distributor: "Distribuidor 2",
    stock: 9,
    net: 264.8,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
  {
    name: 'ASUS TUF Gaming VG259Q 24,5" 144Hz',
    brand: "ASUS",
    category: "Monitores",
    code: "90LM0530-B01370",
    image: "/landing/products/asus-vg259q.jpg",
    distributor: "Distribuidor 4",
    stock: 17,
    net: 163.5,
    iva: 10.5,
    updated: "Actualizado hoy, 8:05",
  },
  {
    name: 'ASUS VA27DQSB 27" IPS 75Hz',
    brand: "ASUS",
    category: "Monitores",
    code: "90LM06H1-B01370",
    image: "/landing/products/asus-va27dqsb.jpg",
    distributor: "Distribuidor 1",
    stock: 22,
    net: 171.2,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
  {
    name: 'ASUS ROG Swift PG42UQ 41,5" OLED 4K',
    brand: "ASUS",
    category: "Monitores",
    code: "90LM0850-B01170",
    image: "/landing/products/asus-pg42uq.jpg",
    distributor: "Distribuidor 2",
    stock: 3,
    net: 1189,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
];

const GIGABYTE_GPUS: DemoProduct[] = [
  {
    name: "GIGABYTE GeForce RTX 4060 GAMING OC 8G",
    brand: "GIGABYTE",
    category: "Placas de video",
    code: "GV-N4060GAMING OC-8GD",
    image: "/landing/products/gigabyte-rtx4060-gaming.jpg",
    distributor: "Distribuidor 3",
    stock: 21,
    net: 341.6,
    iva: 10.5,
    updated: "Actualizado hoy, 7:50",
  },
  {
    name: "GIGABYTE GeForce RTX 4060 EAGLE OC 8G",
    brand: "GIGABYTE",
    category: "Placas de video",
    code: "GV-N4060EAGLE OC-8GD",
    image: "/landing/products/gigabyte-rtx4060-eagle.jpg",
    distributor: "Distribuidor 1",
    stock: 16,
    net: 318.9,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
  {
    name: "GIGABYTE GeForce RTX 3050 WINDFORCE OC 6G",
    brand: "GIGABYTE",
    category: "Placas de video",
    code: "GV-N3050WF2OC-6GD",
    image: "/landing/products/gigabyte-rtx3050-windforce.jpg",
    distributor: "Distribuidor 4",
    stock: 40,
    net: 204.7,
    iva: 10.5,
    updated: "Actualizado hoy, 8:05",
  },
  {
    name: "GIGABYTE Radeon RX 7600 GAMING OC 8G",
    brand: "GIGABYTE",
    category: "Placas de video",
    code: "GV-R76GAMING OC-8GD",
    image: "/landing/products/gigabyte-rx7600-gaming.jpg",
    distributor: "Distribuidor 2",
    stock: 11,
    net: 288.3,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
  {
    name: "GIGABYTE GeForce RTX 4060 Ti GAMING OC 8G",
    brand: "GIGABYTE",
    category: "Placas de video",
    code: "GV-N406TGAMING OC-8GD",
    image: "/landing/products/gigabyte-rtx4060ti-gaming.jpg",
    distributor: "Distribuidor 1",
    stock: 7,
    net: 433.5,
    iva: 10.5,
    updated: "Actualizado hoy, 8:20",
  },
  {
    name: "GIGABYTE GeForce RTX 4070 WINDFORCE OC 12G",
    brand: "GIGABYTE",
    category: "Placas de video",
    code: "GV-N4070WF3OC-12GD",
    image: "/landing/products/gigabyte-rtx4070-windforce.jpg",
    distributor: "Distribuidor 3",
    stock: 5,
    net: 608.2,
    iva: 10.5,
    updated: "Actualizado hoy, 7:50",
  },
];

export interface DemoSearch {
  query: string;
  category: string;
  brand: string;
  /** Unidades que la demo suma al carrito del primer resultado. */
  addQty: number;
  results: DemoProduct[];
}

/** Las búsquedas que va mostrando la portada, una por vuelta. */
export const SEARCHES: DemoSearch[] = [
  { query: SEARCH_QUERY, category: "Memorias", brand: "ADATA", addQty: 8, results: SEARCH_RESULTS },
  { query: "monitor asus", category: "Monitores", brand: "ASUS", addQty: 3, results: ASUS_MONITORS },
  { query: "placa de video gigabyte", category: "Placas de video", brand: "GIGABYTE", addQty: 2, results: GIGABYTE_GPUS },
];

export function withIva(net: number, iva: number) {
  return Math.round(net * (1 + iva / 100) * 100) / 100;
}

/**
 * Envío habitual de ejemplo por distribuidor: la forma y el costo por pedido,
 * en pesos. En NODO sale de los pedidos del comercio o de lo que carga a mano.
 */
export const DEMO_SHIPPING: Record<string, { label: string; ars: number }> = {
  "Distribuidor 1": { label: "Moto", ars: 9500 },
  "Distribuidor 2": { label: "Moto", ars: 12000 },
  "Distribuidor 3": { label: "Expreso", ars: 18000 },
  "Distribuidor 4": { label: "Comisionista", ars: 7500 },
};

/** Cotización de ejemplo para pasar el envío en pesos al precio en dólares. */
export const DEMO_ARS_PER_USD = 1500;

export const ars = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

/** Cómo se arma el costo final de una sola oferta (sin comparar distribuidores). */
export const COST_EXAMPLE = {
  product: SEARCH_RESULTS[0],
  perceptionLabel: "Percepción IIBB",
  perceptionPct: 3,
};

export interface DemoCartLine {
  name: string;
  qty: number;
  unit: number;
}

export interface DemoCartGroup {
  provider: string;
  mode: "portal" | "whatsapp";
  lines: DemoCartLine[];
  orderNumber: string;
}

export const CART_GROUPS: DemoCartGroup[] = [
  {
    provider: "Distribuidor 1",
    mode: "portal",
    orderNumber: "118204",
    lines: [
      { name: "ADATA DIMM 16GB DDR5 5600MHz", qty: 6, unit: 41.2 },
      { name: "ADATA SODIMM 8GB DDR4 3200MHz", qty: 10, unit: 14.9 },
    ],
  },
  {
    provider: "Distribuidor 2",
    mode: "portal",
    orderNumber: "00741263",
    lines: [{ name: "ADATA DIMM 16GB DDR4 3200MHz", qty: 8, unit: 27.6 }],
  },
  {
    provider: "Tu proveedor por lista",
    mode: "whatsapp",
    orderNumber: "",
    lines: [{ name: "Cable HDMI 2.0 1,8 m", qty: 20, unit: 2.1 }],
  },
];
