import { compileBrandHtml, inferBrandHubTarget, sanitizeBrandHtml, sanitizeCss, splitBrandHtml, appendMissingLandingSlots } from "./brand-html";

describe("sanitizeBrandHtml", () => {
  it("saca scripts y handlers", () => {
    const dirty = `<p onclick="alert(1)">Hola</p><script>alert(2)</script><a href="javascript:alert(3)">x</a>`;
    const clean = sanitizeBrandHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toMatch(/<p>Hola<\/p>/);
  });

  it("conserva CSS de <style>, class y style inline", () => {
    const raw = `<style>.hero{color:#c00;font-size:32px}</style><div class="hero" style="padding:24px">Marca</div>`;
    const clean = sanitizeBrandHtml(raw);
    expect(clean).toMatch(/<style>\.hero\{color:#c00;font-size:32px\}<\/style>/);
    expect(clean).toMatch(/class="hero"/);
    expect(clean).toMatch(/style="padding:24px"/);
    expect(clean).toMatch(/>Marca<\/div>/);
  });

  it("saca el body de un documento completo y deja el CSS del head", () => {
    const raw = `<!doctype html><html><head><style>body{background:#fff}</style></head><body class="home"><h1 class="t">Hola</h1></body></html>`;
    const clean = sanitizeBrandHtml(raw);
    expect(clean).toMatch(/<style>body\{background:#fff\}<\/style>/);
    expect(clean).toMatch(/class="nodo-brand-root home"/);
    expect(clean).toMatch(/<h1 class="t">Hola<\/h1>/);
    expect(clean).not.toMatch(/<html/i);
    expect(clean).not.toMatch(/<body/i);
  });

  it("conserva SVG simple y atributos de layout viejos", () => {
    const raw = `<div align="center" bgcolor="#111"><svg viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#0f0"/></svg></div>`;
    const clean = sanitizeBrandHtml(raw);
    expect(clean).toMatch(/align="center"/);
    expect(clean).toMatch(/bgcolor="#111"/);
    expect(clean).toMatch(/<svg /);
    expect(clean).toMatch(/viewBox="0 0 10 10"/i);
    expect(clean).toMatch(/<path /);
  });

  it("deja hojas de estilo https y fuentes de Google", () => {
    const raw = `<link rel="stylesheet" href="https://cdn.example.com/brand.css"/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"/>`;
    const clean = sanitizeBrandHtml(raw);
    expect(clean).toMatch(/cdn\.example\.com\/brand\.css/);
    expect(clean).toMatch(/fonts\.googleapis\.com/);
  });

  it("es idempotente sobre HTML ya sanitizado", () => {
    const raw = `<style>body{color:#000}</style><body><p class="x">Hola</p></body>`;
    const once = sanitizeBrandHtml(raw);
    const twice = sanitizeBrandHtml(once);
    expect(twice).toBe(once);
  });

  it("bloquea css peligroso", () => {
    expect(sanitizeCss("body{background:url(javascript:alert(1))}").toLowerCase()).not.toContain("javascript:");
    expect(sanitizeCss("@import 'https://evil.test/x.css'; p{color:red}")).not.toMatch(/evil/);
  });
});

describe("splitBrandHtml / compileBrandHtml", () => {
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

  it("compila un documento con slots nativos para el canvas", () => {
    const { html, slots } = compileBrandHtml(`<style>.x{color:red}</style><p>{{nombre}}</p>`);
    expect(html).toMatch(/<style>\.x\{color:red\}<\/style>/);
    expect(html).toMatch(/<slot name="nombre"><\/slot>/);
    expect(slots).toEqual(["nombre"]);
  });

  it("al compilar reescribe body/html del CSS a :host", () => {
    const { html } = compileBrandHtml(`<style>body{background:#0a0}</style><p>x</p>`);
    expect(html).toMatch(/<style>:host\{background:#0a0\}<\/style>/);
  });

  it("no deja huecos de 100vh en el host", () => {
    const { html } = compileBrandHtml(`<style>body{min-height:100vh;height:100vh}</style><p>x</p>`);
    expect(html).toMatch(/min-height:\s*0/);
    expect(html).toMatch(/height:\s*auto/);
    expect(html).not.toMatch(/100vh/);
  });

  it("baja position:fixed para que no tape la landing", () => {
    const { html } = compileBrandHtml(`<style>.nav{position:fixed;inset:0}</style><p>x</p>`);
    expect(html).toMatch(/position:absolute/);
    expect(html).not.toMatch(/position:\s*fixed/);
  });

  it("reconoce el hueco de novedades", () => {
    const { slots } = compileBrandHtml("{{novedades}}{{noticias}}");
    expect(slots).toEqual(["novedades", "noticias"]);
  });
});

describe("inferBrandHubTarget", () => {
  it("saca del texto un botón muerto", () => {
    expect(inferBrandHubTarget("Ver productos", "#")).toBe("#productos");
    expect(inferBrandHubTarget("Semáforo", "")).toBe("#productos");
    expect(inferBrandHubTarget("Nuestras acciones", null)).toBe("#acciones");
    expect(inferBrandHubTarget("Novedades", "javascript:void(0)")).toBe("#novedades");
    expect(inferBrandHubTarget("Hablar", "#")).toBe("#contacto");
  });

  it("no toca un link que ya va a algún lado", () => {
    expect(inferBrandHubTarget("Sitio", "https://gigabyte.com")).toBeNull();
    expect(inferBrandHubTarget("Buscar", "/search?marca=Gigabyte")).toBeNull();
  });

  it("un botón muerto sin texto útil igual salta a productos", () => {
    expect(inferBrandHubTarget("Menú", "#")).toBe("#productos");
    expect(inferBrandHubTarget("  ", "")).toBe("#productos");
  });
});

describe("appendMissingLandingSlots", () => {
  it("mete los módulos que el HTML no declaró, en el mismo documento", () => {
    const out = appendMissingLandingSlots("<h1>Gigabyte</h1>{{productos}}");
    expect(out).toContain("<h1>Gigabyte</h1>");
    expect(out).toContain("{{productos}}");
    expect(out).toContain('name="acciones"');
    expect(out).toContain('name="novedades"');
    expect(out).not.toMatch(/<slot name="productos">/);
    expect(out).toContain("nodo-landing-modules");
  });
});
