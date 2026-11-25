import { storeDomainFrom } from "./retail-logos.service";

describe("storeDomainFrom", () => {
  it("toma el dominio más repetido del local y descarta HardGamers y CDNs", () => {
    expect(
      storeDomainFrom([
        "https://www.hardgamers.com.ar/product/venex:a1",
        "https://www.venex.com.ar/products_images/1.png",
        "https://venex.com.ar/products_images/2.png",
        "https://d1.cloudfront.net/x.png",
      ])
    ).toBe("venex.com.ar");
  });
  it("sin URLs útiles devuelve null", () => {
    expect(storeDomainFrom([null, "no es url", "https://www.hardgamers.com.ar/x"])).toBeNull();
  });
});
