import { gtin14 } from "../keys";
import { connectorFor } from "./manufacturers";
import {
  aulaConnector,
  shopifyHandleFrom,
  shopifyImagesFor,
  shopifyVariantFor,
  ShopifyProduct,
  variantWords,
} from "./manufacturers/shopify";
import { LookupQuery, SourceFetcher } from "./types";

function query(partial: Partial<LookupQuery>): LookupQuery {
  return { brandKey: "aula", brand: "Aula", partNumber: null, pnKey: null, gtin: null, name: "", hints: [], ...partial };
}

const IMG = (n: string) => `//cdn.shopify.com/s/files/aula/${n}.jpg`;
const HTTPS = (n: string) => `https:${IMG(n)}`;

/** Como devuelve Shopify `/products/<handle>.js`: un modelo, un color por variante. */
const f75: ShopifyProduct = {
  title: "Teclado Aula F75 Wired",
  handle: "teclado-aula-f75-wired",
  images: [IMG("negro-1"), IMG("negro-2"), IMG("blanco-1"), IMG("blanco-2"), IMG("blanco-3"), IMG("violeta-1")],
  variants: [
    { id: 1, title: "Negro / Switch Blue", options: ["Negro", "Switch Blue"], barcode: "6948391202846", featured_image: { src: IMG("negro-1") } },
    { id: 2, title: "Blanco", options: ["Blanco"], barcode: "6948391203225", featured_image: { src: IMG("blanco-1") } },
    { id: 3, title: "Violeta", options: ["Violeta"], barcode: "6978080504883", featured_image: { src: IMG("violeta-1") } },
  ],
};

describe("Shopify: fotos de la variante exacta", () => {
  it("elige la variante por código de barras y trae solo sus fotos", () => {
    const v = shopifyVariantFor(f75, query({ gtin: gtin14("6948391203225"), name: "F75 Wired White Ingles" }));
    expect(v?.id).toBe(2);
    expect(shopifyImagesFor(f75, v)).toEqual([HTTPS("blanco-1"), HTTPS("blanco-2"), HTTPS("blanco-3")]);
  });

  it("la última variante llega hasta el final de la galería", () => {
    expect(shopifyImagesFor(f75, f75.variants![2])).toEqual([HTTPS("violeta-1")]);
  });

  it("sin código, reconoce el color traducido si es la única variante que cierra", () => {
    const v = shopifyVariantFor(f75, query({ name: "F75 Wired Black Ingles SW Blue" }));
    expect(v?.id).toBe(1);
  });

  it("si hay duda, no elige ninguna y no trae fotos", () => {
    const ambiguous: ShopifyProduct = {
      ...f75,
      variants: [
        { id: 1, title: "Negro", options: ["Negro"], featured_image: { src: IMG("negro-1") } },
        { id: 2, title: "Azul", options: ["Azul"], featured_image: { src: IMG("blanco-1") } },
      ],
    };
    // "Black ... SW Blue": cierran negro y azul a la vez.
    const v = shopifyVariantFor(ambiguous, query({ name: "F75 Wired Black Ingles SW Blue" }));
    expect(v).toBeNull();
    expect(shopifyImagesFor(ambiguous, v)).toEqual([]);
  });

  it("variante sin foto propia: ninguna foto, nunca la de otro color", () => {
    const sinFoto: ShopifyProduct = { ...f75, variants: [{ ...f75.variants![0], featured_image: null }, f75.variants![1]] };
    expect(shopifyImagesFor(sinFoto, sinFoto.variants![0])).toEqual([]);
  });

  it("galería desordenada: solo la foto propia", () => {
    const desordenado: ShopifyProduct = { ...f75, images: [IMG("blanco-1"), IMG("negro-1"), IMG("negro-2"), IMG("violeta-1")] };
    expect(shopifyImagesFor(desordenado, f75.variants![0])).toEqual([HTTPS("negro-1")]);
  });

  it("producto de una sola variante: todas las fotos", () => {
    const single: ShopifyProduct = { images: [IMG("a"), IMG("b")], variants: [{ id: 9, title: "Default Title" }] };
    expect(shopifyImagesFor(single, single.variants![0])).toEqual([HTTPS("a"), HTTPS("b")]);
  });

  it("traduce colores e idiomas", () => {
    expect(variantWords("Black Español")).toEqual(["negro", "espanol"]);
    expect(variantWords("Negro / Inglés")).toEqual(["negro", "ingles"]);
  });
});

describe("Shopify: link de la lista directo al producto", () => {
  it("toma el handle solo si el link es de la misma tienda", () => {
    expect(shopifyHandleFrom("https://aulagaming.com.ar/products/teclado-aula-f75-wired?_pos=2&_ss=r", "https://aulagaming.com.ar")).toBe("teclado-aula-f75-wired");
    expect(shopifyHandleFrom("https://otra.com/products/x", "https://aulagaming.com.ar")).toBeNull();
    expect(shopifyHandleFrom("no es un link", "https://aulagaming.com.ar")).toBeNull();
  });

  it("va directo a la ficha del link, sin buscar, y devuelve la variante del EAN", async () => {
    const calls: string[] = [];
    const fetcher: SourceFetcher = async (_source, url) => {
      calls.push(url);
      return url.endsWith("/products/teclado-aula-f75-wired.js") ? { status: 200, body: f75, url } : { status: 404, body: null, url };
    };
    const r = await aulaConnector.lookup(
      query({
        gtin: gtin14("6978080504883"),
        name: "F75 Wired White-Blue-Dark Purple Ingles",
        productUrls: ["https://aulagaming.com.ar/products/teclado-aula-f75-wired?_pos=2"],
      }),
      fetcher
    );
    expect(calls).toEqual(["https://aulagaming.com.ar/products/teclado-aula-f75-wired.js"]);
    expect(r?.images.map((i) => i.url)).toEqual([HTTPS("violeta-1")]);
    expect(r?.gtins).toEqual([gtin14("6978080504883")]);
    expect(r?.url).toBe("https://aulagaming.com.ar/products/teclado-aula-f75-wired?variant=3");
  });

  it("Aula, IROK y ATK tienen conector", () => {
    expect(connectorFor("aula")?.source).toBe("aula");
    expect(connectorFor("irok")?.source).toBe("irok");
    expect(connectorFor("atk")?.source).toBe("atk");
  });
});
