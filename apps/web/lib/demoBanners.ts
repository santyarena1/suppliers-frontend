import type { Banner } from "@/lib/api";
import type { BannerSlot } from "@/lib/brand-presets";

/**
 * Relleno de demostración para el bento del buscador. Se usa solo en slots
 * sin banner real cargado por el admin ni campaña paga.
 *
 * Mosaicos de marca: arte, logo y producto de la web oficial de cada marca.
 * Mosaicos de categoría: 2–3 productos reales de marcas que tienen esa
 * categoría. El origen de cada archivo está en public/banners/sources.json.
 * Los textos solo dicen cosas verificables (líneas y productos que existen).
 * Las dos bandas finas son de NODO. Todo queda marcado "Demo" hasta que la
 * marca contrate o mande su material.
 */

export type DemoLogo = {
  src: string;
  alt: string;
  /** Logo oscuro que hay que pasar a blanco sobre fondo negro. */
  invert?: boolean;
};

export type BrandDemo = {
  kind: "brand";
  accent: string;
  art: string;
  /** Ancho que ocupa el arte, pegado a la derecha (el resto es el fundido). */
  artWidth: string;
  artPosition: string;
  logo: DemoLogo;
  kicker: string;
  title: string;
  body: string;
  tags: string[];
  cta: { label: string; href: string };
};

export type CategoryProduct = {
  image: string;
  model: string;
  logo: DemoLogo;
};

export type CategoryDemo = {
  kind: "category";
  title: string;
  body: string;
  cta: { label: string; href: string };
  /** El tercero solo se muestra cuando el mosaico es ancho. */
  products: [CategoryProduct, CategoryProduct, CategoryProduct];
};

export type ImageDemo = { kind: "image"; banner: Banner };

export type DemoFill = BrandDemo | CategoryDemo | ImageDemo;

const L = "/banners/logos";
const P = "/banners/products";
const search = (q: string) => `/search?q=${encodeURIComponent(q)}`;

const LOGO = {
  asus: { src: `${L}/asus.svg`, alt: "ASUS" },
  gigabyte: { src: `${L}/gigabyte.svg`, alt: "GIGABYTE" },
  msi: { src: `${L}/msi.svg`, alt: "MSI" },
  logitechG: { src: `${L}/logitechg.svg`, alt: "Logitech G" },
  corsair: { src: `${L}/corsair.svg`, alt: "Corsair" },
  hyperx: { src: `${L}/hyperx.png`, alt: "HyperX" },
  samsung: { src: `${L}/samsung.png`, alt: "Samsung" },
  lg: { src: `${L}/lg.svg`, alt: "LG" },
  lenovo: { src: `${L}/lenovo.svg`, alt: "Lenovo" },
  hp: { src: `${L}/hp.svg`, alt: "HP" },
} satisfies Record<string, DemoLogo>;

function imageDemo(slot: BannerSlot, imageUrl: string, title: string): ImageDemo {
  return {
    kind: "image",
    banner: {
      id: `demo-${slot}`,
      position: "search",
      slot,
      imageUrl,
      title,
      subtitle: "NODO",
      linkUrl: null,
      order: 0,
      active: true,
    },
  };
}

const DEMO: Record<BannerSlot, DemoFill> = {
  hero_main: {
    kind: "brand",
    accent: "#ff0029",
    art: "/banners/brands/asus/hero_main.webp",
    artWidth: "82%",
    artPosition: "center",
    logo: { src: `${L}/rog-dark.png`, alt: "ROG · Republic of Gamers" },
    kicker: "ASUS · Notebooks gamer",
    title: "ROG Strix",
    body: "La línea de notebooks gamer de ASUS Republic of Gamers, con placas GeForce RTX.",
    tags: ["Republic of Gamers", "GeForce RTX"],
    cta: { label: "Ver ROG Strix", href: search("rog strix") },
  },
  hero_side: {
    kind: "brand",
    accent: "#ff6a13",
    art: "/banners/brands/aorus/hero_side.webp",
    artWidth: "72%",
    artPosition: "center",
    logo: { src: `${L}/aorus-white.png`, alt: "AORUS" },
    kicker: "GIGABYTE",
    title: "Placas GeForce RTX",
    body: "La línea premium de GIGABYTE en placas GeForce RTX.",
    tags: ["GeForce RTX"],
    cta: { label: "Ver AORUS", href: search("aorus") },
  },
  tile_4: {
    kind: "brand",
    accent: "#e60012",
    art: "/banners/brands/msi/tile_4.webp",
    artWidth: "74%",
    artPosition: "left center",
    logo: { ...LOGO.msi, invert: true },
    kicker: "Placas de video",
    title: "GeForce RTX",
    body: "Placas GeForce RTX de MSI: GAMING TRIO, VENTUS y SUPRIM.",
    tags: ["GAMING TRIO", "SUPRIM"],
    cta: { label: "Ver MSI", href: search("msi") },
  },
  tile_1: {
    kind: "category",
    title: "Placas de video",
    body: "GeForce RTX de ASUS, GIGABYTE y MSI.",
    cta: { label: "Ver placas", href: search("rtx") },
    products: [
      { image: `${P}/gpu-asus-prime-rtx5070ti.jpg`, model: "PRIME RTX 5070 Ti", logo: LOGO.asus },
      { image: `${P}/gpu-gigabyte-rtx5070-gaming.jpg`, model: "RTX 5070 GAMING OC", logo: LOGO.gigabyte },
      { image: `${P}/gpu-msi-rtx5060-gaming-trio.jpg`, model: "RTX 5060 GAMING TRIO", logo: LOGO.msi },
    ],
  },
  tile_2: {
    kind: "category",
    title: "Periféricos",
    body: "Mouse, teclados y auriculares de Logitech G, Corsair y HyperX.",
    cta: { label: "Ver periféricos", href: search("teclado") },
    products: [
      { image: `${P}/per-logitech-g502x-plus.jpg`, model: "G502 X PLUS", logo: LOGO.logitechG },
      { image: `${P}/per-corsair-k70-core-tkl.jpg`, model: "K70 CORE TKL", logo: LOGO.corsair },
      { image: `${P}/per-hyperx-cloud-stinger2.jpg`, model: "Cloud Stinger 2", logo: LOGO.hyperx },
    ],
  },
  tile_3: {
    kind: "category",
    title: "Monitores",
    body: "ASUS ROG Swift, Samsung Odyssey y LG UltraGear.",
    cta: { label: "Ver monitores", href: search("monitor") },
    products: [
      { image: `${P}/mon-asus-rog-pg32ucdp.jpg`, model: "ROG Swift PG32UCDP", logo: LOGO.asus },
      { image: `${P}/mon-samsung-odyssey-g5.jpg`, model: "Odyssey G5", logo: LOGO.samsung },
      { image: `${P}/mon-lg-ultragear-24gs60f.jpg`, model: "UltraGear 24GS60F", logo: LOGO.lg },
    ],
  },
  strip: imageDemo("strip", "/banners/strip.svg", "Un pedido por distribuidor, armado en un solo carrito"),
  mid_wide: {
    kind: "brand",
    accent: "#e31837",
    art: "/banners/brands/hyperx/mid_wide.webp",
    artWidth: "76%",
    artPosition: "center",
    logo: { src: `${L}/hyperx-white.png`, alt: "HyperX" },
    kicker: "HyperX · Auriculares",
    title: "Cloud Stinger 3",
    body: "Auriculares gamer de HyperX, también en versión inalámbrica.",
    tags: ["Inalámbricos"],
    cta: { label: "Ver HyperX", href: search("hyperx") },
  },
  mid_a: {
    kind: "brand",
    accent: "#ea0029",
    art: "/banners/brands/xpg/mid_a.webp",
    artWidth: "70%",
    artPosition: "center",
    logo: { src: `${L}/xpg.svg`, alt: "XPG" },
    kicker: "ADATA",
    title: "Gabinetes y fuentes",
    body: "La línea gamer de ADATA: gabinetes y fuentes como la PROBE.",
    tags: ["Gabinetes", "Fuentes"],
    cta: { label: "Ver XPG", href: search("xpg") },
  },
  mid_b: {
    kind: "category",
    title: "Notebooks",
    body: "Notebooks gamer de MSI, Lenovo y HP.",
    cta: { label: "Ver notebooks", href: search("notebook") },
    products: [
      { image: `${P}/nb-msi-cyborg15.jpg`, model: "Cyborg 15", logo: LOGO.msi },
      { image: `${P}/nb-lenovo-legion5.jpg`, model: "Legion 5", logo: LOGO.lenovo },
      { image: `${P}/nb-hp-victus15.jpg`, model: "Victus 15", logo: LOGO.hp },
    ],
  },
  mid_strip: imageDemo("mid_strip", "/banners/mid_strip.svg", "Todo tu catálogo en una búsqueda"),
};

export function demoFillForSlot(slot: BannerSlot): DemoFill {
  return DEMO[slot];
}
