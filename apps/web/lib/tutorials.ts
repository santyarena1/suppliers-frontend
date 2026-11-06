import type { TenantType } from "@/lib/auth";

export interface Tutorial {
  title: string;
  src: string;
}

const video = (title: string, file: string): Tutorial => ({ title, src: `/tutoriales/${file}.mp4` });

const PRIMEROS_PASOS = video("Primeros pasos", "01-primeros-pasos");
const PROVEEDORES = video("Proveedores", "02-proveedores");
const BUSQUEDA = video("Búsqueda", "03-busqueda");
const COMPARADOR = video("Comparador y ficha de producto", "04-comparador-ficha");
const CARRITO = video("Carrito y compra", "05-carrito");
const PEDIDOS = video("Pedidos y seguimiento", "06-pedidos");
const PRESUPUESTOS = video("Presupuestos y armador de PC", "07-presupuestos-armador");
const VENDER = video("Vender en NODO", "08-vender");
const MENSAJES = video("Mensajes", "09-mensajes");
const CONFIGURACION = video("Configuración, equipo, plan e integración", "10-configuracion-equipo-plan-api");
const DISTRIBUIDOR = video("Si sos distribuidor", "11-distribuidor");

const BY_PREFIX: [string, Tutorial][] = [
  ["/proveedores", PROVEEDORES],
  ["/credentials", PROVEEDORES],
  ["/search", BUSQUEDA],
  ["/comparador", COMPARADOR],
  ["/product", COMPARADOR],
  ["/cart", CARRITO],
  ["/pedidos", PEDIDOS],
  ["/presupuestos", PRESUPUESTOS],
  ["/vender", VENDER],
  ["/tienda", VENDER],
  ["/mensajes", MENSAJES],
  ["/configuracion", CONFIGURACION],
  ["/equipo", CONFIGURACION],
  ["/suscripcion", CONFIGURACION],
  ["/integracion-api", CONFIGURACION],
  ["/clientes", DISTRIBUIDOR],
  ["/codigos", DISTRIBUIDOR],
  ["/publicidad", DISTRIBUIDOR],
];

/** El video de la pantalla actual, o `null` si ese módulo no tiene. */
export function tutorialForPath(pathname: string, tenantType: TenantType | null | undefined): Tutorial | null {
  if (tenantType === "DISTRIBUTOR" && (pathname === "/" || pathname.startsWith("/pedidos"))) return DISTRIBUIDOR;
  if (pathname === "/") return tenantType === "BRAND" ? null : PRIMEROS_PASOS;
  const match = BY_PREFIX.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match?.[1] ?? null;
}
