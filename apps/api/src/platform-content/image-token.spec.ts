import { decryptImageUrl, encryptImageUrl, imageKey } from "./image-token";

const KEY = imageKey("a".repeat(64));
const URL_A = "https://acustock.thegamershop.com.ar/media/rtx5060-1.jpg";
const NOW = 1_800_000_000;

describe("token de foto", () => {
  it("no deja ver la dirección y se descifra con la misma clave", () => {
    const token = encryptImageUrl(URL_A, KEY, NOW);

    expect(token).not.toContain("acustock");
    expect(Buffer.from(token, "base64url").toString("latin1")).not.toContain("acustock");
    expect(decryptImageUrl(token, KEY, NOW)).toBe(URL_A);
  });

  it("es el mismo para todos dentro de la ventana (la caché sigue sirviendo)", () => {
    expect(encryptImageUrl(URL_A, KEY, NOW)).toBe(encryptImageUrl(URL_A, KEY, NOW + 60));
  });

  it("vence después de la ventana", () => {
    const token = encryptImageUrl(URL_A, KEY, NOW);

    expect(decryptImageUrl(token, KEY, NOW + 13 * 3600)).toBeNull();
  });

  it("rechaza otra clave o un token alterado", () => {
    const token = encryptImageUrl(URL_A, KEY, NOW);
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");

    expect(decryptImageUrl(token, imageKey("otra clave"), NOW)).toBeNull();
    expect(decryptImageUrl(tampered, KEY, NOW)).toBeNull();
  });
});
