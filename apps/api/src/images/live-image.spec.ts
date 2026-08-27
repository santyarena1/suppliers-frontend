import { firstLiveImage, isPublicHttpUrl, isStoredAssetPath, probeLiveImage, sniffRasterImageMime } from "./live-image";

describe("live-image", () => {
  it("reconoce jpeg/png/gif/webp por magic bytes", () => {
    expect(sniffRasterImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffRasterImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffRasterImageMime(Buffer.from("GIF89a...."))).toBe("image/gif");
    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0);
    webp.write("WEBP", 8);
    expect(sniffRasterImageMime(webp)).toBe("image/webp");
    expect(sniffRasterImageMime(Buffer.from("<!DOCTYPE html>"))).toBeNull();
  });

  it("rechaza URLs privadas o no http", () => {
    expect(isPublicHttpUrl("https://cdn.example/a.jpg")).toBe(true);
    expect(isPublicHttpUrl("https://facebook.com/a.jpg")).toBe(true);
    expect(isPublicHttpUrl("http://127.0.0.1/x.jpg")).toBe(false);
    expect(isPublicHttpUrl("https://10.0.0.8/x.jpg")).toBe(false);
    expect(isPublicHttpUrl("https://192.168.1.2/x.jpg")).toBe(false);
    expect(isPublicHttpUrl("https://169.254.1.1/x.jpg")).toBe(false);
    expect(isPublicHttpUrl("ftp://cdn.example/a.jpg")).toBe(false);
    expect(isPublicHttpUrl("/assets/abc")).toBe(false);
  });

  it("detecta paths de assets propios", () => {
    expect(isStoredAssetPath("/assets/abc")).toBe(true);
    expect(isStoredAssetPath("/uploads/x.jpg")).toBe(true);
    expect(isStoredAssetPath("https://cdn.example/a.jpg")).toBe(false);
  });

  it("no acepta HTML ni archivos diminutos aunque el HTTP sea 200", async () => {
    const html = await probeLiveImage("https://cdn.example/a.jpg", async () => ({
      status: 200,
      buffer: Buffer.from("<!DOCTYPE html><html></html>"),
    }));
    expect(html).toBeNull();

    const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, ...Array(20).fill(0)]);
    const tiny = await probeLiveImage("https://cdn.example/a.jpg", async () => ({
      status: 200,
      buffer: tinyJpeg,
    }));
    expect(tiny).toBeNull();
  });

  it("toma la primera URL que realmente es una foto", async () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(900, 1)]);
    const live = await firstLiveImage(
      ["https://cdn.example/dead.jpg", "https://cdn.example/ok.jpg"],
      async (url) => {
        if (url.endsWith("dead.jpg")) return { status: 404, buffer: Buffer.alloc(0) };
        return { status: 200, buffer: jpeg };
      }
    );
    expect(live?.url).toBe("https://cdn.example/ok.jpg");
    expect(live?.mime).toBe("image/jpeg");
  });
});
