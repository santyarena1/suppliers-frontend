/**
 * Nombres reales del menú de Invid (ISO-8859-1). Sirven para reconstruir
 * categorías ya guardadas con � cuando el HTML se leyó como UTF-8.
 */
export const INVID_NAV_LABELS = [
  "Accesorios",
  "Almacenamiento",
  "Pen Drive",
  "Tarjetas de memoria",
  "Computadoras",
  "All in One",
  "KIT PC",
  "Mini PC",
  "PC",
  "Conectividad",
  "Accesorios Bluetooth",
  "Access Point y Extensores de Rango",
  "Cables",
  "De red",
  "Multimedia y Periféricos",
  "Cámaras IP",
  "Media conv/módulos",
  "Modem ADSL y GPON",
  "Placas de Red WiFi PCI",
  "Placas de Red WiFi USB",
  "POE (Power Over Ethernet)",
  "Router",
  "Router Wireless",
  "Smart Home",
  "Switches Administrables",
  "Switches No Administrables",
  "Consumibles",
  "Cartuchos",
  "Consumibles HP",
  "Tintas",
  "Coolers",
  "Fans",
  "Watercoolers",
  "DESTACADOS",
  "Destacados / Nuevos Ingresos",
  "Discos Rígidos / SSD",
  "Carry Disk",
  "Disco Rígido Externo",
  "Disco Rígido NAS",
  "Disco Rígido Notebook",
  "Disco Rígido SATA",
  "Disco SSD",
  "Disco SSD M2",
  "Electrodomésticos",
  "Energía",
  "Estabilizadores",
  "UPS",
  "Gabinetes y Fuentes",
  "Fuentes de Alimentación",
  "Gabinetes con Fuente",
  "Gabinetes sin Fuente",
  "Kit Gabinete, teclado, mouse y parlante",
  "Impresoras",
  "Ink Jet",
  "Laser",
  "Multifunción",
  "Memorias RAM",
  "Memoria DDR2",
  "Memoria DDR3",
  "Memoria DDR4",
  "Memoria DDR5",
  "Memoria Sodimm",
  "Microprocesadores",
  "Monitores",
  "Monitor Consumo",
  "Monitor Corporativo",
  "Monitor Gamer",
  "Mothers",
  "Plataforma AMD",
  "Plataforma Intel",
  "Notebooks",
  "Consumo",
  "Corporativa",
  "Gamer",
  "Periféricos",
  "Auriculares",
  "Micrófonos",
  "Mouse",
  "Mousepads",
  "Parlantes",
  "Power Banks",
  "Teclado + Mouse",
  "Teclados",
  "Web Cam",
  "Placas de video",
  "Línea AMD RADEON",
  "Línea Intel Arc",
  "Línea NVIDIA GEFORCE",
  "Línea Quadro/Radeon Pro",
  "Proyectores",
  "Scanners",
  "Setup gamer",
  "Tablets",
  "SUPER OFERTAS",
] as const;

function compactForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9\uFFFD]+/g, "")
    .toLowerCase();
}

/** El � de UTF-8 mal leído sustituye exactamente una letra latin1 (áéíóúñü). */
export function latin1BrokenMatches(broken: string, good: string): boolean {
  const b = compactForMatch(broken).replace(/\uFFFD/g, "*");
  const g = compactForMatch(good);
  if (!b.includes("*")) return b === g;
  const re = new RegExp(`^${b.replace(/\*/g, "[a-z0-9]")}$`);
  return re.test(g);
}

function repairUtf8Mojibake(value: string): string {
  if (!/[ÃÂ]/.test(value)) return value;
  const asUtf8 = Buffer.from(value, "latin1").toString("utf8");
  if (asUtf8.includes("\uFFFD") || asUtf8 === value) return value;
  return asUtf8;
}

export function repairInvidMojibake(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  let s = value.trim();
  if (!s) return undefined;
  s = repairUtf8Mojibake(s);
  if (!s.includes("\uFFFD")) return s;
  const hit = INVID_NAV_LABELS.find((label) => latin1BrokenMatches(s, label));
  return hit ?? s;
}

export function decodeInvidEntities(s: string): string {
  return s
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&reg;/gi, "®")
    .replace(/&trade;/gi, "™")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&deg;/gi, "°")
    .replace(/&#(x?[0-9a-fA-F]+);/g, (_, code: string) => {
      const n = code.toLowerCase().startsWith("x") ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCharCode(n) : _;
    });
}
