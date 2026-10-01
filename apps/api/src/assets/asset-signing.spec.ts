import { signAssetPath, verifyAssetSignature } from "./asset-signing";

const ID = "3cf09f70-ce41-465b-b189-828a864e1f48";

describe("asset-signing", () => {
  beforeAll(() => {
    process.env.ASSET_SIGNING_SECRET = "secreto-de-prueba";
  });

  it("firma y verifica un archivo", () => {
    const signed = signAssetPath(`/assets/${ID}`);
    const url = new URL(signed, "https://x");
    expect(verifyAssetSignature(ID, url.searchParams.get("exp"), url.searchParams.get("sig"))).toBe(true);
  });

  it("la firma de un archivo no sirve para otro", () => {
    const url = new URL(signAssetPath(`/assets/${ID}`), "https://x");
    expect(verifyAssetSignature("9b2b436c-cf67-444d-b7fd-66f63cffc000", url.searchParams.get("exp"), url.searchParams.get("sig"))).toBe(false);
  });

  it("vencida o sin firma, no vale", () => {
    const url = new URL(signAssetPath(`/assets/${ID}`, Date.now() - 30 * 86_400_000), "https://x");
    expect(verifyAssetSignature(ID, url.searchParams.get("exp"), url.searchParams.get("sig"))).toBe(false);
    expect(verifyAssetSignature(ID, undefined, undefined)).toBe(false);
  });

  it("cambiar el vencimiento invalida la firma", () => {
    const url = new URL(signAssetPath(`/assets/${ID}`), "https://x");
    const exp = Number(url.searchParams.get("exp")) + 86_400_000;
    expect(verifyAssetSignature(ID, exp, url.searchParams.get("sig"))).toBe(false);
  });

  it("no toca links que no son de archivos", () => {
    expect(signAssetPath("/uploads/viejo.png")).toBe("/uploads/viejo.png");
  });
});
