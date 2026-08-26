import { buildImageSearchQuery, hasProductImage, mergeProductImage, pickFirstImageUrl } from "./product-image";

describe("product-image", () => {
  it("detecta fichas sin foto", () => {
    expect(hasProductImage(null)).toBe(false);
    expect(hasProductImage("")).toBe(false);
    expect(hasProductImage("  ")).toBe(false);
    expect(hasProductImage("https://cdn.example/a.jpg")).toBe(true);
  });

  it("conserva la foto previa si el proveedor no trae", () => {
    expect(mergeProductImage(null, "https://serper/a.jpg")).toBe("https://serper/a.jpg");
    expect(mergeProductImage("  ", "https://serper/a.jpg")).toBe("https://serper/a.jpg");
    expect(mergeProductImage("https://prov/b.jpg", "https://serper/a.jpg")).toBe("https://prov/b.jpg");
    expect(mergeProductImage(undefined, undefined)).toBeNull();
  });

  it("arma la query con marca, nombre y código", () => {
    expect(
      buildImageSearchQuery({
        brand: "Logitech",
        name: "Teclado MX Keys",
        ean: "097855146162",
      })
    ).toBe("Logitech Teclado MX Keys 097855146162");
  });

  it("no duplica el código si ya está en el nombre", () => {
    expect(
      buildImageSearchQuery({
        name: "Mouse 910-005647",
        sku: "910-005647",
      })
    ).toBe("Mouse 910-005647");
  });

  it("toma la primera imageUrl http de Serper", () => {
    expect(
      pickFirstImageUrl({
        images: [
          { title: "a", imageUrl: "https://cdn.example/1.jpg" },
          { title: "b", imageUrl: "https://cdn.example/2.jpg" },
        ],
      })
    ).toBe("https://cdn.example/1.jpg");
    expect(pickFirstImageUrl({ images: [] })).toBeNull();
    expect(pickFirstImageUrl({ images: [{ thumbnailUrl: "https://t.example/x.png" }] })).toBe(
      "https://t.example/x.png"
    );
  });
});
