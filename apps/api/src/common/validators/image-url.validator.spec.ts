import { isImageUrlOrUploadPath } from "./image-url.validator";

describe("isImageUrlOrUploadPath", () => {
  it("acepta URLs http(s)", () => {
    expect(isImageUrlOrUploadPath("https://cdn.example.com/a.png")).toBe(true);
    expect(isImageUrlOrUploadPath("http://localhost:3000/x.jpg")).toBe(true);
  });

  it("acepta paths /assets/<uuid>", () => {
    expect(
      isImageUrlOrUploadPath("/assets/550e8400-e29b-41d4-a716-446655440000")
    ).toBe(true);
  });

  it("acepta paths legacy /uploads/...", () => {
    expect(isImageUrlOrUploadPath("/uploads/abc-123.png")).toBe(true);
  });

  it("rechaza valores inválidos", () => {
    expect(isImageUrlOrUploadPath("")).toBe(false);
    expect(isImageUrlOrUploadPath("/uploads/../etc/passwd")).toBe(false);
    expect(isImageUrlOrUploadPath("/assets/not-a-uuid")).toBe(false);
    expect(isImageUrlOrUploadPath("/assets/../secret")).toBe(false);
    expect(isImageUrlOrUploadPath("ftp://x.com/a.png")).toBe(false);
    expect(isImageUrlOrUploadPath("not-a-url")).toBe(false);
  });
});
