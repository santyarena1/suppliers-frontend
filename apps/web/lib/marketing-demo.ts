/**
 * Datos de las demos de la landing. Los productos, códigos y fotos son reales
 * (catálogo de NODO); los distribuidores van sin nombre y los precios son de
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
