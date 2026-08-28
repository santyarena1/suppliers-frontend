import { sanitizeBrandHtml, splitBrandHtml } from "./brand-html";

describe("sanitizeBrandHtml", () => {
  it("saca scripts y handlers", () => {
    const dirty = `<p onclick="alert(1)">Hola</p><script>alert(2)</script><a href="javascript:alert(3)">x</a>`;
    const clean = sanitizeBrandHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toMatch(/<p>Hola<\/p>/);
  });
});

describe("splitBrandHtml", () => {
  it("parte el HTML en huecos de NODO", () => {
    const parts = splitBrandHtml("<h1>{{nombre}}</h1>{{productos}}<p>fin</p>");
    expect(parts).toEqual([
      { type: "html", html: "<h1>" },
      { type: "slot", name: "nombre" },
      { type: "html", html: "</h1>" },
      { type: "slot", name: "productos" },
      { type: "html", html: "<p>fin</p>" },
    ]);
  });

  it("deja los huecos aunque el HTML venga sucio", () => {
    const parts = splitBrandHtml(`<h1 onclick="x">{{nombre}}</h1><script>alert(1)</script>{{semaforos}}`);
    expect(parts).toEqual([
      { type: "html", html: "<h1>" },
      { type: "slot", name: "nombre" },
      { type: "html", html: "</h1>" },
      { type: "slot", name: "semaforos" },
    ]);
  });
});
