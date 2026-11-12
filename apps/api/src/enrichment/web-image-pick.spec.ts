import { pickWebImages, webHitProblem, webImageQuery } from "./web-image-pick";

const hit = (title: string, source = "bestbuy.com") => ({ imageUrl: `https://x/${encodeURIComponent(title)}.jpg`, title, source });
const aula = (name: string) => ({ name, brand: "AULA" });

describe("web-image-pick", () => {
  it("acepta un título con el mismo modelo y color", () => {
    expect(webHitProblem(hit("AULA HERO68 HE 60% Key Wired Hall Effect Gaming Keyboard - Pink"), aula("Hero 68 HE Pink Wired Ingles"))).toBeNull();
  });

  it("rechaza otra versión del modelo (HE cuando la lista no dice HE)", () => {
    expect(webHitProblem(hit("AULA HERO68 HE 60% Key Wired Hall Effect Gaming Keyboard - Pink"), aula("Hero 68 Pink Wired Ingles"))).toMatch(/otra versión/);
  });

  it("rechaza páginas con colores de más (varias variantes en la foto)", () => {
    expect(webHitProblem(hit("AULA S99 Pro Wireless Keyboard Green/White"), aula("S99 Pro Wireless Verde Ingles"))).toMatch(/otros colores/);
  });

  it("rechaza si falta un color del nombre", () => {
    expect(webHitProblem(hit("AULA F75 Wireless Keyboard Black Blue"), aula("F75 Wireless Black-Blue-Orange Español"))).toMatch(/falta naranja/);
  });

  it("acepta los colores en otro orden e idioma", () => {
    expect(webHitProblem(hit("Teclado Aula F75 Inalámbrico Negro Azul Naranja", "mercadolibre.com.ar"), aula("F75 Wireless Black-Blue-Orange Español"))).toBeNull();
  });

  it("rechaza otro modelo con el mismo prefijo", () => {
    expect(webHitProblem(hit("AULA F75 F99 Wireless Black Red keyboard"), aula("F75 Max Wireless Black-Red Ingles"))).toMatch(/falta max|otro modelo/);
    expect(webHitProblem(hit("AULA F75 Max F99 Wireless Black Red keyboard"), aula("F75 Max Wireless Black-Red Ingles"))).toMatch(/otro modelo \(F99\)/);
  });

  it("rechaza la versión con cable para un inalámbrico", () => {
    expect(webHitProblem(hit("AULA F75 Wired Black Red"), aula("F75 Wireless Black Red Ingles"))).toMatch(/con cable/);
  });

  it("rechaza sitios de collages y títulos sin la marca", () => {
    expect(webHitProblem(hit("AULA Hero 68 HE Pink", "pinterest.com"), aula("Hero 68 HE Pink"))).toMatch(/no confiable/);
    expect(webHitProblem(hit("Hero 68 HE Pink keyboard", "shop.com"), aula("Hero 68 HE Pink"))).toMatch(/no dice AULA/);
  });

  it("en mousepads no exige el tamaño pero sí que no diga otro", () => {
    expect(webHitProblem(hit("AULA SKY Mousepad Orange"), aula("SKY Orange Large 490 X 420"))).toBeNull();
    expect(webHitProblem(hit("AULA SKY Mousepad Orange Mini"), aula("SKY Orange Large 490 X 420"))).toMatch(/otra versión/);
  });

  it("rechaza otra terminación (transparente, degradé)", () => {
    expect(webHitProblem(hit("AULA F75 Wireless Pink Degrade"), aula("F75 Wireless Pink Ingles"))).toMatch(/terminación/);
  });

  it("prefiere tiendas de la marca y comercios grandes", () => {
    const { candidates, rejected } = pickWebImages(
      [hit("AULA Hero 68 HE White Translucent", "random.shop"), hit("AULA Hero 68 HE White Translucent", "aulagear.com"), hit("AULA Hero 68 HE Black", "aulagear.com")],
      aula("Hero 68 HE White Translucent Wired Ingles")
    );
    expect(candidates.map((c) => c.source)).toEqual(["aulagear.com", "random.shop"]);
    expect(rejected).toHaveLength(1);
  });

  it("arma la búsqueda sin el idioma", () => {
    expect(webImageQuery("F75 Wireless Black-Blue-Orange Español", "AULA")).toBe("AULA F75 Wireless Black-Blue-Orange");
  });
});

describe("pickSecondaryImages", () => {
  const { pickSecondaryImages } = require("./web-image-pick");
  const v = (id: number, options: string[], src: string | null) => ({ id, title: options.join(" / "), options, barcode: null, sku: null, featured_image: src ? { src } : null });
  const hero = {
    title: "AULA HERO 68 HE Magnetic Switch Gaming Keyboard",
    handle: "aula-hero68-he",
    images: ["https://cdn/pink.jpg", "https://cdn/white.jpg", "https://cdn/black.jpg"],
    variants: [v(1, ["Pink"], "https://cdn/pink.jpg"), v(2, ["White Translucent"], "https://cdn/white.jpg"), v(3, ["Black Red"], "https://cdn/black.jpg")],
  };
  const item = (name: string) => ({ name, brand: "AULA", brandInTitle: false });

  it("toma la foto de la variante del mismo modelo y color", () => {
    const r = pickSecondaryImages([hero], item("Hero 68 HE White Translucent Wired Ingles"));
    expect(r.images[0]).toBe("https://cdn/white.jpg");
  });

  it("no usa el HE para un Hero 68 sin HE", () => {
    expect(pickSecondaryImages([hero], item("Hero 68 Pink Wired Ingles")).images).toEqual([]);
  });

  it("no usa una ficha de un solo color que no es el del nombre", () => {
    const white = { title: "AULA F75 White", handle: "f75-white", images: ["https://cdn/w.jpg"], variants: [v(9, ["Default Title"], null)] };
    expect(pickSecondaryImages([white], item("F75 Wireless Black-Blue-Orange Español")).images).toEqual([]);
  });

  it("no usa una ficha de un solo variante sin color", () => {
    const plain = { title: "AULA F75 Wireless", handle: "f75", images: ["https://cdn/x.jpg"], variants: [v(9, ["Default Title"], null)] };
    expect(pickSecondaryImages([plain], item("F75 Wireless Black-Blue-Orange Español")).images).toEqual([]);
  });

  it("exige la marca en el título en tiendas que venden varias marcas", () => {
    const epo = { ...hero, title: "Epomaker HERO 68 HE" };
    expect(pickSecondaryImages([epo], { ...item("Hero 68 HE Pink"), brandInTitle: true }).images).toEqual([]);
  });
});

describe("pickSecondaryImages con distribución ANSI", () => {
  const { pickSecondaryImages } = require("./web-image-pick");
  const v = (id: number, options: string[], src: string | null) => ({ id, title: options.join(" / "), options, barcode: null, sku: null, featured_image: src ? { src } : null });
  const max = {
    title: "AULA F75 MAX",
    handle: "aula-f75-max",
    images: ["https://cdn/black.jpg", "https://cdn/blackred.jpg"],
    variants: [
      v(1, ["ANSI Layout", "Black", "LEOBOG Reaper Switch"], "https://cdn/black.jpg"),
      v(2, ["ANSI Layout", "Black Red", "LEOBOG Reaper Switch"], "https://cdn/blackred.jpg"),
      v(3, ["ISO-DE", "Black", "LEOBOG Reaper Switch"], "https://cdn/black.jpg"),
    ],
  };
  it("ANSI es el teclado en inglés", () => {
    expect(pickSecondaryImages([max], { name: "F75 Max Wireless Black-Red Ingles", brand: "AULA", brandInTitle: false }).images[0]).toBe("https://cdn/blackred.jpg");
  });
  it("no toma el ANSI para uno en español", () => {
    expect(pickSecondaryImages([max], { name: "F75 Max Wireless Black-Red Español", brand: "AULA", brandInTitle: false }).images).toEqual([]);
  });
});
