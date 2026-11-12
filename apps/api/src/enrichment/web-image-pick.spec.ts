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
