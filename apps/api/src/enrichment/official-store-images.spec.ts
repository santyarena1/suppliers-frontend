import { candidateWhere } from "../images/image-sync-candidates";
import { fromCatalogJson, officialStoreLink, pickOfficialImages } from "./official-store-images";
import type { ShopifyProduct } from "./sources/manufacturers/shopify";

/**
 * Catálogos armados con los títulos y variantes reales de aulagaming.com.ar y
 * atkgaming.com.ar (leídos por el servidor el 2026-11-12). Cada variante tiene su
 * foto propia `<handle>-<n>.jpg` y la galería está en el orden de las variantes.
 */
function product(handle: string, title: string, variants: (string | string[])[]): ShopifyProduct {
  const img = (i: number) => `https://cdn.test/${handle}-${i}.jpg`;
  const multi = variants.length > 1;
  return {
    title,
    handle,
    images: variants.map((_, i) => img(i)),
    variants: variants.map((v, i) => ({
      id: i + 1,
      title: Array.isArray(v) ? v.join(" / ") : v,
      options: Array.isArray(v) ? v : [v],
      featured_image: multi ? { src: img(i) } : null,
    })),
  };
}

const f75Variants = [
  "F75 - Black Degradé", "F75 - Black Pink Degradé", "F75 - Blue Degradé", "F75 - Purple Degradé",
  "F75 - BLUE / WHITE / PURPLE", "F75 - PURPLE / BEIGE / GREEN", "F75 - BLUE / WHITE / DARK BLUE",
  "F75 - BLACK / DARK BLUE / ORANGE", "F75 - Negro Contour", "F75 - Blanco Contour", "F75 - Negro Degradé Español",
  "F75 - Comic - Idioma Español", "F75 - Comic - Idioma Inglés", "F75 - White/Green",
].flatMap((color) => [[color, "LEOBOG Reaper"], [color, "LEOBOG Star Vector"]]);

const AULA: ShopifyProduct[] = [
  product("teclado-aula-f75", "Teclado Aula F75", f75Variants),
  product("teclado-aula-f75-wired", "Teclado Aula F75 Wired", ["F75 Wired - Blanco", "F75 Wired - Negro", "F75 Wired - BLACK / ORANGE / BLUE", "F75 Wired - WHITE / BLUE / DARK PURPLE"]),
  product("teclado-aula-f75-max", "Teclado Aula F75 MAX", [
    "Black Degradé", "BLUE WHITE DARK PURPLE", "LIGHT BLUE WHITE PURPLE", "Black Degradé Contour Line", "F75 MAX - Black Grey Red",
    "F75 MAX - Black Degradé - Idioma Español", "F75 MAX - Blue / White / Purple - Idioma Español", "F75 MAX - Comic",
  ]),
  product("f75-he", "Teclado Aula F75 HE", ["F75 HE - Blanco Contour Line", "F75 HE - Black / White / Grey", "F75 HE - Negro Contour Line"]),
  product("aula-f75-wrist-rest", "Aula F75 Wrist Rest", ["F75 Wrist Rest - Negro", "F75 Wrist Rest - Azul"]),
  product("teclado-aula-ag60", "Teclado Aula AG60", ["AG60 - Silver Case White Frosted Keys"]),
  product("teclado-aula-ag60-pro", "Teclado Aula AG60 Pro", ["AG60 Pro - Silver Case White Frosted Keys", "AG60 Pro - Red", "AG60 PRO - Black"]),
  product("aula-mini60-he", "Aula Mini60 HE", ["Default Title"]),
  product("aula-mini60-he-pro", "Aula Mini60 HE PRO/MAX", ["Aula Mini60 HE PRO - Blanco", "Aula Mini60 HE MAX - Negro", "Aula Mini 60 HE PRO - Negro"]),
  product("teclado-aula-s99", "Teclado Aula S99", ["Default Title"]),
  product("teclado-aula-s99-pro", "Teclado Aula S99 Pro", ["S99 Pro Español - Azul / Violeta / Beige", "S99 Pro Español - Gris / Beige / Marron", "S99 Pro - Verde/Beige/Verde Claro"]),
  product("teclado-aula-s100-pro", "Teclado Aula S100 Pro", ["S100 Pro - White/Blue/Light Purple", "S100 Pro - White/Blue/Purple", "S100 Pro - Black/Orange"]),
  product("teclado-aula-hero-68-he", "Teclado Aula HERO 68 HE", ["HERO68 HE - Rosa Degradé", "HERO68 HE - Black Red Degradé", "HERO68 HE - White Side Print", "HERO68 HE - Frosted White"]),
  product("teclado-aula-win68he-series", "Teclado Aula WIN68HE Series", ["WIN68HE MAX - White + Grey + Blue", "WIN68HE MAX - Gris + Negro + Amarillo", "WIN68HE - Negro", "WIN68HE - Blanco Sideprint"]),
  product("aula-s12-pro", "Aula S12 PRO", ["S12 PRO Negro", "S12 Pro Blanco"]),
  product("aula-s12-wired", "Aula S12 Wired", ["Default Title"]),
  product("aula-sc620", "Aula SC620", ["SC620 - Negro", "SC620 - Blanco", "SC620 - Black Contour", "SC620 - White Contour"]),
  product("aula-s6", "Aula S6", ["S6 - Negro", "S6 - Blanco", "S6 - Azul Blanco", "S6 - Beige / Milk"]),
  product("combo-kit-4-en-1-aula-t650", "Combo Kit 4 en 1 Aula T650", ["Default Title"]),
];

const ATK: ShopifyProduct[] = [
  product("auriculares-n9-neptune", "Auriculares N9 Neptune", ["N9 Pro - Negro", "N9 Pro - Blanco"]),
  product("dragonfly-a9", "Dragonfly A9", ["Default Title"]),
  product("dragonfly-a9-mini", "Dragonfly A9 Mini+", ["A9 Mini+ - Negro", "A9 Mini+ - Blanco", "A9 Mini+ - Lake Green", "A9 Mini+ - Petal Pink", "A9 Mini+ - Rosa"]),
  product("dragonfly-a9-pro-max-2-0", "Dragonfly A9 Pro Max 2.0", ["A9 Pro Max 2.0 - Negro", "ATK Pro Max 2.0 - Blanco", "A9 Pro Max 2.0 - Rosa"]),
  product("dragonfly-a9-plus", "Dragonfly A9 Plus 2.0", ["A9 Plus - Negro", "A9 Plus - Blanco", "A9 Plus - Rosa"]),
  product("dragonfly-a9-se-2-0", "Dragonfly A9 SE 2.0", ["Default Title"]),
  product("ghost-extreme", "Ghost Extreme", ["Ghost Extreme - Negro", "Ghost Extreme - Púrpura"]),
  product("ghost-ultimate", "Ghost Ultimate", ["Ghost Ultimate - Plateado", "Ghost Ultimate - Negro", "Ghost Ultimate - Rojo"]),
  product("vxe-r1-se", "VXE R1 SE+", ["VXE R1 SE+ - Blanco", "VXE R1 SE+ - Negro"]),
  product("vxe-r1-pro-max", "VXE R1 PRO MAX", ["VXE R1 PRO MAX - Negro", "VXE R1 PRO MAX - Blanco"]),
  product("zero", "ZERO", ["Zero - Frosted Purple", "Zero - Frosted White", "Zero - Negro", "Zero - Blanco"]),
  product("zero-extreme", "ZERO Extreme", ["Zero Extreme - Frosted Translucent Icy", "Zero Extreme - Frosted Black"]),
  product("mousepad-reverie", "Mousepad Reverie", ["Reverie - Negro y Blanco", "Reverie - Rosa y Blanco"]),
  product("mousepad-knight-zodiac", "Mousepad Knight", ["Knight - Rojo", "Knight - Negro"]),
  product("mousepad-sky-xsoft", "Mousepad Sky XSoft", ["Sky XSoft - Black L", "Sky XSoft - Naranja M", "Sky XSoft - Naranja L", "Sky XSoft - Rosa"]),
  product("x1-v2-ultimate", "X1 V2 Ultimate", ["X1 V2 Ultimate - Rojo", "X1 V2 Ultimate - Blanco", "X1 V2 Ultimate - Negro", "X1 V2 Ultimate - Plateado"]),
];

/** Producto y variante elegidos ("handle#n", n = número de variante desde 0), o null. */
function pick(catalog: ShopifyProduct[], name: string, linkedHandle: string | null = null): string | null {
  const res = pickOfficialImages(catalog, { name, ean: null, linkedHandle });
  const first = res.images[0];
  if (!first) return null;
  const m = first.match(/cdn\.test\/(.+)-(\d+)\.jpg$/);
  return m ? `${m[1]}#${m[2]}` : first;
}

describe("fotos de la tienda oficial", () => {
  it("reconoce los links de Aula, IROK y ATK", () => {
    expect(officialStoreLink("https://aulagaming.com.ar/products/teclado-aula-f75-wired?_pos=2&_ss=r")).toMatchObject({ handle: "teclado-aula-f75-wired" });
    expect(officialStoreLink("https://www.atkgaming.com.ar/products/n9-pro")?.store.source).toBe("atk");
    expect(officialStoreLink("https://otra.com/products/x")).toBeNull();
  });

  it("F75: el color del nombre, sin importar el switch, y el idioma cuando lo dice", () => {
    expect(pick(AULA, "F75 Wireless Degrade Black Ingles")).toBe("teclado-aula-f75#0");
    expect(pick(AULA, "F75 Wireless Degrade Black Español")).toBe("teclado-aula-f75#20");
    expect(pick(AULA, "F75 Wireless Comic Ingles")).toBe("teclado-aula-f75#24");
    expect(pick(AULA, "F75 Wireless Comic Español")).toBe("teclado-aula-f75#22");
    expect(pick(AULA, "F75 Wireless White Contour Lines Ingles")).toBe("teclado-aula-f75#18");
    expect(pick(AULA, "F75 Wireless Blue-White-Purple Español")).toBe("teclado-aula-f75#8");
    expect(pick(AULA, "F75 Wireless Degrade Pink Ingles")).toBeNull(); // la tienda tiene «Black Pink», no «Pink»
  });

  it("el link de la lista no manda: un F75 inalámbrico linkeado al F75 Wired toma la foto del inalámbrico", () => {
    expect(pick(AULA, "F75 Wireless Black-Dark Blue-Orange Ingles", "teclado-aula-f75-wired")).toBe("teclado-aula-f75#14");
    expect(pick(AULA, "F75 Wired Black-Orange-Blue Ingles")).toBe("teclado-aula-f75-wired#2");
    expect(pick(AULA, "F75 Wired Black Ingles SW Red")).toBe("teclado-aula-f75-wired#1");
  });

  it("F75 MAX / HE / Wrist Rest no se confunden con el F75", () => {
    expect(pick(AULA, "F75 Max Wireless Black Degrade Contour Lines Ingles")).toBe("teclado-aula-f75-max#3");
    expect(pick(AULA, "F75 Max Wireless Black Degrade Ingles")).toBe("teclado-aula-f75-max#0");
    expect(pick(AULA, "F75 Max Wireless Black Degrade Español")).toBe("teclado-aula-f75-max#5");
    expect(pick(AULA, "F75 Max Wireless Black-Red Ingles")).toBeNull();
    expect(pick(AULA, "F75 HE Black Contour")).toBe("f75-he#2");
    expect(pick(AULA, "F75 Wrist Rest Blue Apoyamuñecas")).toBe("aula-f75-wrist-rest#1");
  });

  it("Pro / no Pro y PRO/MAX", () => {
    expect(pick(AULA, "AG60 Pro White Wired Ingles", "teclado-aula-ag60")).toBeNull(); // AG60 Pro no tiene blanca a secas
    expect(pick(AULA, "AG60 Pro Red Wired Ingles")).toBe("teclado-aula-ag60-pro#1");
    expect(pick(AULA, "AG60 Silver Wired")).toBe("teclado-aula-ag60#0");
    expect(pick(AULA, "Mini60 HE Wireless Black Ingles")).toBe("aula-mini60-he#0");
    expect(pick(AULA, "Mini60 HE Pro Wireless White Ingles", "aula-mini60-he")).toBe("aula-mini60-he-pro#0");
    expect(pick(AULA, "Mini60 HE Pro Wireless Black Ingles")).toBe("aula-mini60-he-pro#2");
    expect(pick(AULA, "Mini60 HE Max Wireless Black Contour Lines Ingles")).toBe("aula-mini60-he-pro#1");
    expect(pick(AULA, "S99 Pro Wireless Gris Retro Español", "teclado-aula-s99")).toBeNull();
    expect(pick(AULA, "S12pro White Wired", "aula-s12-pro")).toBe("aula-s12-pro#1"); // empata con «S12 Wired»: desempata el link
    expect(pick(AULA, "S12pro White Wired")).toBeNull();
    expect(pick(AULA, "S12 Wired Black")).toBe("aula-s12-wired#0");
  });

  it("la variante más específica y las palabras pegadas", () => {
    expect(pick(AULA, "S100 Pro Wireless White-Blue Light-Purple")).toBe("teclado-aula-s100-pro#0");
    expect(pick(AULA, "S100 Pro Wireless White-Blue-Purple")).toBe("teclado-aula-s100-pro#1");
    expect(pick(AULA, "Hero 68 HE White Sideprint Wired Ingles SW Meteor")).toBe("teclado-aula-hero-68-he#2");
    expect(pick(AULA, "WIN68HE MAX Blak-Grey-Yellow Wired Ingles")).toBe("teclado-aula-win68he-series#1");
    expect(pick(AULA, "SC620 White Contour Lines")).toBe("aula-sc620#3");
    expect(pick(AULA, "SC620 White Wireless")).toBe("aula-sc620#1");
  });

  it("si la tienda no tiene ese color, sin foto", () => {
    expect(pick(AULA, "S6 Blue Wireless")).toBeNull();
    expect(pick(AULA, "S6 Milk Wireless")).toBeNull();
    expect(pick(AULA, "F2088 Air Grey Wireless Ingles")).toBeNull();
  });

  it("título distinto al nombre: el link vale solo si trae el código de modelo", () => {
    expect(pick(AULA, "T650 Combo Teclado Auricular Mousepad y Mouse", "combo-kit-4-en-1-aula-t650")).toBe("combo-kit-4-en-1-aula-t650#0");
    expect(pick(ATK, "N9 Pro Black", "auriculares-n9-neptune")).toBe("auriculares-n9-neptune#0");
    expect(pick(ATK, "N9 Pro Black", null)).toBeNull();
  });

  it("ATK: los links corridos de la lista no confunden", () => {
    expect(pick(ATK, "Ghost Ultimate Black", "ghost-extreme")).toBe("ghost-ultimate#1");
    expect(pick(ATK, "Ghost Extreme Purple", "vxe-r1-se")).toBe("ghost-extreme#1");
    expect(pick(ATK, "VXE R1 SE + Black", "vxe-r1-pro-max")).toBe("vxe-r1-se#1");
    expect(pick(ATK, "VXE R1 PRO MAX White", "zero")).toBe("vxe-r1-pro-max#1");
    expect(pick(ATK, "X1 V2 Ultimate Silver", "ghost-ultimate")).toBe("x1-v2-ultimate#3");
    expect(pick(ATK, "Knight Zodiac Red Large 490 X 420", "mousepad-reverie")).toBe("mousepad-knight-zodiac#0");
    expect(pick(ATK, "Reverie Black-White Large 490 X 420", "mousepad-knight-zodiac")).toBe("mousepad-reverie#0");
    expect(pick(ATK, "Zero Frosted White", "zero-extreme")).toBe("zero#1");
    expect(pick(ATK, "Zero White", "zero-extreme")).toBe("zero#3");
    expect(pick(ATK, "Zero Extreme Frosted Black", "mousepad-sky-xsoft")).toBe("zero-extreme#1");
    expect(pick(ATK, "SKY Black Large 490 X 420", "mousepad-sky-xsoft")).toBeNull();
  });

  it("ATK Dragonfly: Mini+, Pro Max 2.0, Plus 2.0, SE y el A9 a secas", () => {
    expect(pick(ATK, "Dragonfly A9 mini + Lake Green")).toBe("dragonfly-a9-mini#2");
    expect(pick(ATK, "Dragonfly A9 mini + Pink")).toBe("dragonfly-a9-mini#4");
    expect(pick(ATK, "Dragonfly A9 mini + Petal Pink")).toBe("dragonfly-a9-mini#3");
    expect(pick(ATK, "Dragonfly A9 Pro Max 2.0 White")).toBe("dragonfly-a9-pro-max-2-0#1");
    expect(pick(ATK, "Dragonfly A9 Plus 2.0 Pink Paw3395 26K Dpi")).toBe("dragonfly-a9-plus#2");
    expect(pick(ATK, "Dragonfly A9 SE 2.0 White")).toBe("dragonfly-a9-se-2-0#0");
    expect(pick(ATK, "Dragonfly A9 White")).toBe("dragonfly-a9#0");
  });

  it("lee /products.json de Shopify", () => {
    const [p] = fromCatalogJson({
      products: [
        {
          title: "Teclado Aula F75",
          handle: "teclado-aula-f75",
          images: [{ src: "https://cdn/a.jpg" }, { src: "https://cdn/b.jpg" }],
          variants: [{ id: 1, title: "F75 - Black Degradé / LEOBOG Reaper", option1: "F75 - Black Degradé", option2: "LEOBOG Reaper", option3: null, barcode: "", featured_image: { src: "https://cdn/a.jpg" } }],
        },
      ],
    });
    expect(p.variants?.[0]).toMatchObject({ options: ["F75 - Black Degradé", "LEOBOG Reaper"], featured_image: { src: "https://cdn/a.jpg" } });
    expect(p.images).toEqual(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
  });

  it("Serper no busca fotos de productos con link a una tienda oficial", () => {
    const where = JSON.stringify(candidateWhere());
    expect(where).toContain("aulagaming.com.ar");
    expect(where).toContain("atkgaming.com.ar");
  });
});
