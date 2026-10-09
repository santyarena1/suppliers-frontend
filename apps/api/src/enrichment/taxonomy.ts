/**
 * Taxonomía unificada del módulo de enriquecimiento. Se detecta por palabras
 * clave sobre la categoría cruda del distribuidor y el nombre del producto; el
 * orden importa (lo más específico primero: "notebook" antes que "procesador",
 * porque un nombre de notebook menciona el procesador).
 */

export interface TaxonomyCategory {
  key: string;
  label: string;
  /** Se evalúan contra la categoría cruda (normalizada). */
  category: RegExp[];
  /** Se evalúan contra el nombre (normalizado) si la categoría no alcanzó. */
  name: RegExp[];
}

export const TAXONOMY: TaxonomyCategory[] = [
  { key: "notebook", label: "Notebooks", category: [/\bnotebook|\blaptop|\bportatil|ultrabook|chromebook/], name: [/^notebook\b|^laptop\b|\bnotebook\b|\bchromebook\b|\bultrabook\b|\bthinkpad\b|\bideapad\b|\bvivobook\b|\bzenbook\b|\bmacbook\b/] },
  { key: "all_in_one", label: "All in One", category: [/all ?in ?one|\baio\b/], name: [/all ?in ?one|\baio\b/] },
  { key: "desktop_pc", label: "PC de escritorio", category: [/\bpc\b.*escritorio|desktop|computadora|equipo armado|mini ?pc/], name: [/^pc\b|\bmini ?pc\b|\bdesktop\b/] },
  { key: "tablet", label: "Tablets", category: [/\btablet/], name: [/^tablet\b|\bipad\b|\bgalaxy tab\b/] },
  { key: "phone", label: "Celulares", category: [/celular|smartphone|telefonia movil/], name: [/^celular\b|^smartphone\b|\biphone\b/] },
  { key: "gpu", label: "Placas de video", category: [/placa.*video|tarjeta.*video|\bvga\b|grafica|\bgpu\b|video card/], name: [/^placa de video|\brtx ?\d{4}|\bgtx ?\d{3,4}|\brx ?\d{4}\b|\barc a\d{3}\b|geforce|radeon/] },
  { key: "motherboard", label: "Motherboards", category: [/mother|placa madre|\bmb\b|mainboard/], name: [/^mother|^placa madre|\b(a|b|h|x|z)\d{3}[a-z]?\b.*(ddr|am[45]|lga|wifi|aorus|tuf|prime|rog|pro)/] },
  { key: "cpu", label: "Procesadores", category: [/procesador|\bcpu\b|micro\b|microprocesador/], name: [/^procesador|^micro\b|^cpu\b|\bryzen [3579]\b.*\d{4}|\bcore (ultra )?i?[3579]\b.*\d{4,5}|\bathlon\b|\bceleron\b|\bpentium\b/] },
  { key: "ram", label: "Memorias RAM", category: [/memoria.*ram|\bram\b|memoria(s)? (pc|notebook|ddr)|^memorias?$|sodimm|dimm/], name: [/^memoria\b.*ddr|\bddr[345]\b.*\d+ ?gb|\bsodimm\b|\budimm\b/] },
  { key: "storage_ssd", label: "Discos SSD", category: [/\bssd|solido|nvme|m\.?2/], name: [/\bssd\b|\bnvme\b|\bm\.2\b.*\d+ ?(gb|tb)/] },
  { key: "storage_hdd", label: "Discos rígidos", category: [/disco.*rigido|\bhdd\b|disco duro|discos? internos?/], name: [/\bhdd\b|disco rigido|\b\d+ ?tb\b.*(sata|7200|5400)/] },
  { key: "external_storage", label: "Almacenamiento externo", category: [/disco.*externo|pendrive|memoria.*usb|flash|tarjeta.*memoria|micro ?sd/], name: [/pendrive|\bmicro ?sd\b|disco externo|\busb\b.*\d+ ?gb|memoria flash/] },
  { key: "psu", label: "Fuentes", category: [/fuente|\bpsu\b|power supply/], name: [/^fuente\b|\b\d{3,4} ?w\b.*(80 ?plus|bronze|gold|platinum|modular)/] },
  { key: "case", label: "Gabinetes", category: [/gabinete|\bcase\b|chasis/], name: [/^gabinete\b|\bmid ?tower\b|\bfull ?tower\b/] },
  { key: "cooler", label: "Coolers y refrigeración", category: [/cooler|refrigeracion|disipador|water ?cool|ventilador/], name: [/^cooler\b|\bwater ?cool|\bdisipador\b|\baio\b.*\d{3} ?mm|\bfan\b.*\d{2,3} ?mm/] },
  { key: "thermal_paste", label: "Pasta térmica", category: [/pasta termica/], name: [/pasta termica|thermal paste/] },
  { key: "monitor", label: "Monitores", category: [/monitor/], name: [/^monitor\b|\b\d{2}(\.\d)?" ?.*\b\d{2,3} ?hz\b/] },
  { key: "tv", label: "Televisores", category: [/televisor|\btv\b|smart tv/], name: [/^smart tv|^televisor|^tv\b/] },
  { key: "projector", label: "Proyectores", category: [/proyector/], name: [/^proyector/] },
  { key: "mouse", label: "Mouses", category: [/mouse|raton/], name: [/^mouse\b|\bmouse gamer\b/] },
  { key: "mousepad", label: "Mousepads", category: [/mouse ?pad|alfombrilla/], name: [/mouse ?pad/] },
  { key: "keyboard", label: "Teclados", category: [/teclado|keyboard/], name: [/^teclado\b|\bkeyboard\b/] },
  { key: "combo_kb_mouse", label: "Combos teclado y mouse", category: [/combo|kit teclado/], name: [/combo.*(teclado|mouse)|kit teclado/] },
  { key: "headset", label: "Auriculares", category: [/auricular|headset|headphone|vincha/], name: [/^auricular|\bheadset\b|\bheadphones?\b|\bin ?ear\b|\bearbuds?\b/] },
  { key: "speaker", label: "Parlantes", category: [/parlante|altavoz|speaker|sonido/], name: [/^parlante|\bspeaker\b|\bsoundbar\b|barra de sonido/] },
  { key: "microphone", label: "Micrófonos", category: [/microfono/], name: [/^microfono/] },
  { key: "webcam", label: "Webcams", category: [/webcam|camara web/], name: [/webcam|camara web/] },
  { key: "router", label: "Routers y access points", category: [/router|access ?point|mesh|wifi|wireless|inalambric/], name: [/^router\b|\baccess point\b|\bmesh\b|\bdeco\b|\brange extender\b|\brepetidor\b/] },
  { key: "switch", label: "Switches", category: [/\bswitch/], name: [/^switch\b|\bswitch\b.*\d+ ?(puertos|port)/] },
  { key: "network_adapter", label: "Placas de red y adaptadores", category: [/placa.*red|adaptador.*(red|wifi|usb)|network adapter/], name: [/adaptador (usb )?(wifi|wi-fi|inalambrico|de red)|placa de red|\bbluetooth\b.*adaptador/] },
  { key: "printer", label: "Impresoras", category: [/impresora|multifuncion|printer/], name: [/^impresora|^multifuncion|\becotank\b|\blaserjet\b|\bdeskjet\b/] },
  { key: "ink_toner", label: "Tintas y tóners", category: [/tinta|toner|cartucho|insumo/], name: [/^cartucho|^toner|^tinta|\bbotella de tinta\b/] },
  { key: "ups", label: "UPS y estabilizadores", category: [/\bups\b|estabilizador|no break/], name: [/^ups\b|^estabilizador|\bups\b.*\d+ ?va\b/] },
  { key: "cable_adapter", label: "Cables y adaptadores", category: [/cable|adaptador|conector|hub/], name: [/^cable\b|^adaptador\b|^hub\b|\bdock(ing)?\b/] },
  { key: "chair", label: "Sillas", category: [/silla/], name: [/^silla/] },
  { key: "console_gaming", label: "Consolas y joysticks", category: [/consola|joystick|gamepad/], name: [/^joystick|^gamepad|^consola|\bjoystick\b/] },
  { key: "smartwatch", label: "Smartwatches y wearables", category: [/smartwatch|reloj|wearable|smart band/], name: [/smartwatch|smart ?band|\breloj inteligente\b/] },
  { key: "camera_security", label: "Cámaras de seguridad", category: [/camara.*(seguridad|ip)|cctv|dvr|nvr|videovigilancia/], name: [/camara ip|\bdvr\b|\bnvr\b|\bcctv\b/] },
  { key: "software", label: "Software y licencias", category: [/software|licencia|antivirus/], name: [/^licencia|\bwindows 1[01]\b.*(pro|home)|\boffice\b.*(365|20\d\d)|antivirus/] },
  { key: "server", label: "Servidores y storage", category: [/servidor|server|\bnas\b/], name: [/^servidor|\bnas\b.*bahias?|\bproliant\b|\bpoweredge\b/] },
  { key: "battery_power", label: "Baterías y energía", category: [/bateria|power ?bank|cargador/], name: [/^bateria|\bpower ?bank\b|^cargador/] },
];

export const TAXONOMY_BY_KEY: Record<string, TaxonomyCategory> = Object.fromEntries(TAXONOMY.map((c) => [c.key, c]));

export function normalizeForTaxonomy(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface CategoryDetection {
  key: string;
  /** category: por la categoría cruda; name: por el nombre. */
  via: "category" | "name";
}

/** Categoría unificada para un producto, o null si no se reconoce. */
export function detectCategory(rawCategory: string | null | undefined, name: string | null | undefined): CategoryDetection | null {
  const cat = normalizeForTaxonomy(rawCategory);
  const nm = normalizeForTaxonomy(name);
  // El nombre manda cuando empieza con el tipo de producto ("Notebook ...", "Mouse ..."):
  // los distribuidores a veces cargan una categoría genérica o equivocada.
  for (const c of TAXONOMY) {
    if (c.name.some((re) => re.exec(nm)?.index === 0)) return { key: c.key, via: "name" };
  }
  if (cat) {
    for (const c of TAXONOMY) if (c.category.some((re) => re.test(cat))) return { key: c.key, via: "category" };
  }
  for (const c of TAXONOMY) if (c.name.some((re) => re.test(nm))) return { key: c.key, via: "name" };
  return null;
}
