import { imageSize, verifyImages, PrefixFetcher } from "./image-verify";

function png(w: number, h: number, seed = 0): Buffer {
  const b = Buffer.alloc(64, seed);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

function jpeg(w: number, h: number): Buffer {
  // SOI, APP0 (16 bytes), SOF0 con alto/ancho.
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 0x03, 0x01, 0x22, 0x00,
  ]);
}

function webpVp8x(w: number, h: number): Buffer {
  const b = Buffer.alloc(40);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

describe("medidas de imagen por cabecera", () => {
  it("PNG, JPEG, WebP y GIF", () => {
    expect(imageSize(png(800, 600))).toEqual({ mime: "image/png", width: 800, height: 600 });
    expect(imageSize(jpeg(1200, 900))).toEqual({ mime: "image/jpeg", width: 1200, height: 900 });
    expect(imageSize(webpVp8x(2000, 1500))).toEqual({ mime: "image/webp", width: 2000, height: 1500 });
    const gif = Buffer.from("GIF89a\x40\x01\xf0\x00", "binary");
    expect(imageSize(gif)).toEqual({ mime: "image/gif", width: 320, height: 240 });
    expect(imageSize(Buffer.from("<html>no</html>"))).toBeNull();
  });
});

describe("verificación de fotos candidatas", () => {
  const responses: Record<string, Buffer | number> = {
    "https://a.com/grande.png": png(1000, 1000, 1),
    "https://b.com/misma.png": png(1000, 1000, 1),
    "https://a.com/chica.png": png(120, 120, 2),
    "https://a.com/html": Buffer.from("<html>"),
    "https://a.com/404": 404,
    "https://a.com/otra.jpg": jpeg(800, 800),
  };
  const fetchPrefix = (async (url: string) => {
    const r = responses[url];
    if (typeof r === "number") return { status: r, contentType: "", buffer: Buffer.alloc(0), url, totalBytes: null };
    return { status: 200, contentType: "image/png", buffer: r, url, totalBytes: r.length };
  }) as unknown as PrefixFetcher;

  it("acepta las buenas, rechaza chicas, repetidas, no-imágenes y errores", async () => {
    const out = await verifyImages(
      Object.keys(responses).map((url) => ({ url, source: "distributor", origin: "ELIT" })),
      fetchPrefix
    );
    const byUrl = Object.fromEntries(out.map((o) => [o.url, o]));
    expect(byUrl["https://a.com/grande.png"].ok).toBe(true);
    expect(byUrl["https://b.com/misma.png"].reason).toContain("repetida");
    expect(byUrl["https://a.com/chica.png"].reason).toContain("chica");
    expect(byUrl["https://a.com/html"].reason).toContain("no es una imagen");
    expect(byUrl["https://a.com/404"].reason).toBe("HTTP 404");
    expect(byUrl["https://a.com/otra.jpg"]).toMatchObject({ ok: true, width: 800, mime: "image/jpeg" });
  });

  it("respeta el máximo de fotos aceptadas", async () => {
    const out = await verifyImages([{ url: "https://a.com/grande.png", source: "x", origin: "x" }, { url: "https://a.com/otra.jpg", source: "x", origin: "x" }], fetchPrefix, 1);
    expect(out.filter((o) => o.ok)).toHaveLength(1);
  });
});
