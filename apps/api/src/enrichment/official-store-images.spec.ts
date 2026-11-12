import { candidateWhere } from "../images/image-sync-candidates";
import { linkMatchesName, officialStoreLink, pickOfficialImages } from "./official-store-images";
import type { ShopifyProduct } from "./sources/manufacturers/shopify";

const CDN = "//aulagaming.com.ar/cdn/shop/files";

/** Ficha `.js` como la de Shopify: un modelo con un color/switch por variante y la galería ordenada. */
const f75: ShopifyProduct = {
  title: "Teclado Mecánico AULA F75 Wired",
  handle: "teclado-aula-f75-wired",
  images: [`${CDN}/negro-1.jpg`, `${CDN}/negro-2.jpg`, `${CDN}/blanco-1.jpg`, `${CDN}/blanco-2.jpg`, `${CDN}/rosa-1.jpg`],
  variants: [
    { id: 1, title: "Negro / Switch Azul", options: ["Negro", "Switch Azul"], barcode: "6948391202846", featured_image: { src: `https:${CDN}/negro-1.jpg` } },
    { id: 2, title: "Blanco / Switch Rojo", options: ["Blanco", "Switch Rojo"], barcode: "", featured_image: { src: `https:${CDN}/blanco-1.jpg` } },
    { id: 3, title: "Rosa / Switch Rojo", options: ["Rosa", "Switch Rojo"], barcode: null, featured_image: { src: `https:${CDN}/rosa-1.jpg` } },
  ],
};

describe("fotos de la tienda oficial", () => {
  it("reconoce los links de Aula, IROK y ATK", () => {
    expect(officialStoreLink("https://aulagaming.com.ar/products/teclado-aula-f75-wired?_pos=2&_ss=r")).toMatchObject({
      handle: "teclado-aula-f75-wired",
      store: { source: "aula" },
    });
    expect(officialStoreLink("https://www.atkgaming.com.ar/products/n9-pro")?.store.source).toBe("atk");
    expect(officialStoreLink("https://irokgaming.com.ar/collections/all")).toBeNull();
    expect(officialStoreLink("https://otra.com/products/x")).toBeNull();
  });

  it("por EAN toma solo las fotos de esa variante", () => {
    const pick = pickOfficialImages(f75, { name: "F75 Wired Black Ingles SW Blue", ean: "6948391202846" });
    expect(pick.images).toEqual([`https:${CDN}/negro-1.jpg`, `https:${CDN}/negro-2.jpg`]);
    expect(pick.note).toContain("EAN");
  });

  it("sin EAN en la tienda, por el color del nombre si es la única variante que encaja", () => {
    const pick = pickOfficialImages(f75, { name: "F75 Wired White SW Red", ean: "6948391203218" });
    expect(pick.images).toEqual([`https:${CDN}/blanco-1.jpg`, `https:${CDN}/blanco-2.jpg`]);
  });

  it("con duda (dos variantes posibles o ninguna), sin foto", () => {
    expect(pickOfficialImages(f75, { name: "F75 Wired SW Red", ean: null }).images).toEqual([]);
    expect(pickOfficialImages(f75, { name: "F75 Wired Verde", ean: null }).images).toEqual([]);
  });

  it("un link que lleva a otro modelo no da fotos", () => {
    expect(linkMatchesName(f75, "F87 Pro Negro")).toBe(false);
    expect(pickOfficialImages(f75, { name: "F87 Pro Negro", ean: null }).images).toEqual([]);
  });

  it("producto de una sola variante: todas sus fotos", () => {
    const n9: ShopifyProduct = {
      title: "Auriculares ATK N9 PRO",
      images: ["//atkgaming.com.ar/cdn/a.jpg", "//atkgaming.com.ar/cdn/b.jpg"],
      variants: [{ id: 9, title: "Default Title", options: ["Default Title"], barcode: null }],
    };
    expect(pickOfficialImages(n9, { name: "ATK N9 PRO Blanco", ean: null }).images).toEqual([
      "https://atkgaming.com.ar/cdn/a.jpg",
      "https://atkgaming.com.ar/cdn/b.jpg",
    ]);
  });

  it("Serper no busca fotos de productos con link a una tienda oficial", () => {
    const where = JSON.stringify(candidateWhere());
    expect(where).toContain("aulagaming.com.ar");
    expect(where).toContain("atkgaming.com.ar");
    expect(where).toContain("irokgaming.com.ar");
  });
});
