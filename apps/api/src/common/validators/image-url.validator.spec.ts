import { isImageUrlOrUploadPath } from "./image-url.validator";

describe("isImageUrlOrUploadPath", () => {
  it("acepta URLs http(s)", () => {
    expect(isImageUrlOrUploadPath("https://cdn.example.com/a.png")).toBe(true);
    expect(isImageUrlOrUploadPath("http://localhost:3000/x.jpg")).toBe(true);
  });

  it("acepta paths /uploads/...", () => {
    expect(isImageUrlOrUploadPath("/uploads/abc-123.png")).toBe(true);
  });

  it("rechaza valores inválidos", () => {
    expect(isImageUrlOrUploadPath("")).toBe(false);
    expect(isImageUrlOrUploadPath("/uploads/../etc/passwd")).toBe(false);
    expect(isImageUrlOrUploadPath("ftp://x.com/a.png")).toBe(false);
    expect(isImageUrlOrUploadPath("not-a-url")).toBe(false);
  });
});
