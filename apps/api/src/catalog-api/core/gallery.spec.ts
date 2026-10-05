import { galleryFromRaw, imagesOf } from "./gallery";

describe("galería del distribuidor", () => {
  it("Elit: imagenes como lista de URLs", () => {
    expect(galleryFromRaw({ imagenes: ["https://elit.com/a.jpg", "https://elit.com/b.jpg"] })).toEqual([
      "https://elit.com/a.jpg",
      "https://elit.com/b.jpg",
    ]);
  });

  it("Grupo Núcleo: url_imagenes como objetos {url}", () => {
    expect(galleryFromRaw({ url_imagenes: [{ url: "https://gn.com/1.jpg" }, { url: "https://gn.com/2.jpg" }] })).toEqual([
      "https://gn.com/1.jpg",
      "https://gn.com/2.jpg",
    ]);
  });

  it("Ceven: itemimages_detail con urls y rutas con espacios", () => {
    const raw = { itemimages_detail: { urls: [{ url: "https://www.ceven.com/Imagenes productos/A1_1.jpg" }, { url: "https://www.ceven.com/Imagenes productos/A1_2.jpg" }] } };
    expect(galleryFromRaw(raw)).toEqual([
      "https://www.ceven.com/Imagenes%20productos/A1_1.jpg",
      "https://www.ceven.com/Imagenes%20productos/A1_2.jpg",
    ]);
    expect(imagesOf({ imageUrl: "https://www.ceven.com/Imagenes productos/A1_1.jpg", gallery: galleryFromRaw(raw) })).toHaveLength(2);
  });

  it("ignora lo que no es URL y no repite", () => {
    expect(galleryFromRaw({ images: ["foto.jpg", "https://x.com/1.jpg", "https://x.com/1.jpg", 3, null] })).toEqual([
      "https://x.com/1.jpg",
    ]);
  });

  it("sin datos crudos o sin galería no inventa nada", () => {
    expect(galleryFromRaw(null)).toEqual([]);
    expect(galleryFromRaw(["https://x.com/1.jpg"])).toEqual([]);
    expect(galleryFromRaw({ descripcion: "https://x.com/1.jpg" })).toEqual([]);
  });

  it("la principal va primero y no se repite en la galería", () => {
    expect(imagesOf({ imageUrl: "https://x.com/1.jpg", gallery: ["https://x.com/1.jpg", "https://x.com/2.jpg"] })).toEqual([
      "https://x.com/1.jpg",
      "https://x.com/2.jpg",
    ]);
    expect(imagesOf({ imageUrl: null, gallery: ["https://x.com/2.jpg"] })).toEqual(["https://x.com/2.jpg"]);
  });
});
