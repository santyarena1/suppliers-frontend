import { hardgamersExternalId, parseHardgamersCards } from "./retail-hardgamers.client";

/**
 * El id de esta fuente convive en la misma columna que el del agregador
 * principal, que siempre usa positivos. Lo único que no se puede romper es esa
 * separación: si un id cayera en positivo, pisaría un producto de la otra
 * fuente.
 */
describe("hardgamersExternalId", () => {
  it("siempre da un entero negativo", () => {
    for (const key of ["liontech:btk8r4", "store:hardcore", "maximus:zzz", "", "a"]) {
      const id = hardgamersExternalId(key);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeLessThan(0);
    }
  });

  it("entra en el rango de un Int de Postgres", () => {
    for (let i = 0; i < 5000; i++) {
      const id = hardgamersExternalId(`tienda${i}:producto${i * 7}`);
      expect(id).toBeGreaterThanOrEqual(-2_147_483_648);
      expect(id).toBeLessThanOrEqual(2_147_483_647);
    }
  });

  it("es determinístico: la misma clave da siempre el mismo id", () => {
    expect(hardgamersExternalId("liontech:btk8r4")).toBe(hardgamersExternalId("liontech:btk8r4"));
  });

  it("separa tiendas de productos y tiendas entre sí", () => {
    expect(hardgamersExternalId("store:hardcore")).not.toBe(hardgamersExternalId("hardcore"));
    expect(hardgamersExternalId("store:hardcore")).not.toBe(hardgamersExternalId("store:maximus"));
  });

  it("no colisiona en un volumen realista de catálogo", () => {
    const seen = new Set<number>();
    let collisions = 0;
    for (let s = 0; s < 20; s++) {
      for (let p = 0; p < 1000; p++) {
        const id = hardgamersExternalId(`tienda${s}:art${p}`);
        if (seen.has(id)) collisions++;
        seen.add(id);
      }
    }
    // 20k claves sobre 2e9 valores: una colisión ya sería sospechosa.
    expect(collisions).toBe(0);
  });
});

describe("parseHardgamersCards (formato sin JSON oculto, octubre 2026)", () => {
  const html = "<section class=\"Store-Highlights\"><article itemscope itemtype=\"http://schema.org/Product\"  class=\"One-Bit-Product\">\n<div class=\"product-image-wrapper\"><div class=\"fav-and-offer-container\"><div id=\"venex:a3hu4a\" class=\"fav favourite\" data-is-favorite=\"false\"></div></div>\n<a href=\"/product/venex:a3hu4a\" title=\"Ver detalles del producto\" class=\"img-container\">\n<img src=\"https://tienda.test/venex:a3hu4a.png\" loading=\"lazy\" decoding=\"async\" itemprop=\"image\" class=\"img\" alt=\"x\">\n</a></div>\n<div class=\"info-container\"><p class=\"store\">\nVenex\n</p>\n<p class=\"product-name\" itemprop=\"name\">\nPLACA RX 9070 XT &amp; OC\n</p></div>\n<div class=\"price-container\"><p itemprop=\"offers\" itemscope itemtype=\"http://schema.org/Offer\" class=\"product-price\">\n<link itemprop=\"availability\" href=\"https://schema.org/InStock\" />\n<meta itemprop=\"priceCurrency\" content=\"ARS\" />\n<span itemprop=\"price\" content=\"1579990\">\n$x\n</span></p></div>\n</article></section>\n<div class=\"Product-List\"><article itemscope itemtype=\"http://schema.org/Product\"  class=\"One-Bit-Product\">\n<div class=\"product-image-wrapper\"><div class=\"fav-and-offer-container\"><div id=\"venex:a3hu4a\" class=\"fav favourite\" data-is-favorite=\"false\"></div></div>\n<a href=\"/product/venex:a3hu4a\" title=\"Ver detalles del producto\" class=\"img-container\">\n<img src=\"https://tienda.test/venex:a3hu4a.png\" loading=\"lazy\" decoding=\"async\" itemprop=\"image\" class=\"img\" alt=\"x\">\n</a></div>\n<div class=\"info-container\"><p class=\"store\">\nVenex\n</p>\n<p class=\"product-name\" itemprop=\"name\">\nPLACA RX 9070 XT &amp; OC\n</p></div>\n<div class=\"price-container\"><p itemprop=\"offers\" itemscope itemtype=\"http://schema.org/Offer\" class=\"product-price\">\n<link itemprop=\"availability\" href=\"https://schema.org/InStock\" />\n<meta itemprop=\"priceCurrency\" content=\"ARS\" />\n<span itemprop=\"price\" content=\"1579990\">\n$x\n</span></p></div>\n</article><article itemscope itemtype=\"http://schema.org/Product\"  class=\"One-Bit-Product\">\n<div class=\"product-image-wrapper\"><div class=\"fav-and-offer-container\"><div id=\"venex:64gr6m\" class=\"fav favourite\" data-is-favorite=\"false\"></div></div>\n<a href=\"/product/venex:64gr6m\" title=\"Ver detalles del producto\" class=\"img-container\">\n<img src=\"https://tienda.test/venex:64gr6m.png\" loading=\"lazy\" decoding=\"async\" itemprop=\"image\" class=\"img\" alt=\"x\">\n</a></div>\n<div class=\"info-container\"><p class=\"store\">\nVenex\n</p>\n<p class=\"product-name\" itemprop=\"name\">\nRTX 5070 TI\n</p></div>\n<div class=\"price-container\"><p itemprop=\"offers\" itemscope itemtype=\"http://schema.org/Offer\" class=\"product-price\">\n<link itemprop=\"availability\" href=\"https://schema.org/OutOfStock\" />\n<meta itemprop=\"priceCurrency\" content=\"ARS\" />\n<span itemprop=\"price\" content=\"2299999\">\n$x\n</span></p></div>\n</article></div>\n<div class=\"Pagination-Container\"><a class=\"Pagination-Control\" href=\"/stores/venex?page=2&limit=54\">2</a><a class=\"Pagination-Control Last\" href=\"/stores/venex?page=34&limit=54\">»</a></div></div>";

  it("lee id, nombre, precio, imagen, stock y local de las tarjetas, sin repetir los destacados", () => {
    const page = parseHardgamersCards(html)!;
    expect(page.storeName).toBe("Venex");
    expect(page.docs).toEqual([
      { _id: "venex:a3hu4a", name: "PLACA RX 9070 XT & OC", price: 1579990, image: "https://tienda.test/venex:a3hu4a.png", availability: true, link: "https://www.hardgamers.com.ar/product/venex:a3hu4a", store: { _id: "venex", name: "Venex" } },
      { _id: "venex:64gr6m", name: "RTX 5070 TI", price: 2299999, image: "https://tienda.test/venex:64gr6m.png", availability: false, link: "https://www.hardgamers.com.ar/product/venex:64gr6m", store: { _id: "venex", name: "Venex" } },
    ]);
  });

  it("saca la cantidad de páginas de la paginación", () => {
    expect(parseHardgamersCards(html)!.pages).toBe(34);
  });

  it("sin tarjetas devuelve null", () => {
    expect(parseHardgamersCards("<html><body>Sin productos</body></html>")).toBeNull();
  });
});
