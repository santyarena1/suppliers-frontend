import { officialStoreContent } from "./official-store-content";
import { officialStoreForBrand } from "./official-store-images";
import { officialPlaceOf } from "./official-store-images.service";

/** Recorte de la página real del AULA F75 HE (aulagaming.com.ar, 16/11). */
const AULA_PAGE = `<div class="container"> <section class="header-section"> <h1>AULA F75 HE - Teclado Magnético</h1>
<p class="subtitle">Interruptores Hall Effect con Rapid Trigger de 0,01 mm y conectividad trimodo</p>
<p>El AULA F75 HE es un teclado magnético de formato 75% que incorpora interruptores Hall Effect.</p>
<div class="key-features"><div class="key-feature-item"><svg><path d="M0"/></svg><h3>Conectividad Trimodo</h3><p>Bluetooth, 2.4 GHz y USB Tipo-C</p></div>
<div class="key-feature-item"><h3>Sondeo de 8000 Hz</h3><p>Escaneo de hasta 160 kHz</p></div></div></section>
<section class="feature-section"><h2>Diseño y Construcción</h2><p>Placa de aleación de aluminio &amp; perilla metálica.</p><img src="x.png"></section>
<section class="specs-section"><div class="container"><h2>Especificaciones Técnicas Completas</h2>
<table class="specs-table"><thead><tr><th>Especificación</th><th>Detalle</th></tr></thead><tbody>
<tr><td>Formato</td><td>75%</td></tr><tr><td>Polling rate</td><td>Hasta 8000 Hz</td></tr></tbody></table></div></section>
<section class="gallery-section"><h2>Galería de Producto</h2><div class="gallery-item"><img src="g.png" alt="Vista 1"></div></section>
<section class="testimonials-section"><h2>Opiniones Verificadas</h2><div class="testimonial-card"><p>Excelente teclado, lo recomiendo</p></div></section></div>`;

describe("ficha de datos de la tienda oficial", () => {
  const c = officialStoreContent(AULA_PAGE);

  it("toma la bajada, la descripción y las especificaciones", () => {
    expect(c.shortDescription).toBe("Interruptores Hall Effect con Rapid Trigger de 0,01 mm y conectividad trimodo");
    expect(c.specs).toEqual([
      { group: null, name: "Formato", value: "75%" },
      { group: null, name: "Polling rate", value: "Hasta 8000 Hz" },
    ]);
    expect(c.descriptionHtml).toContain("<p>El AULA F75 HE es un teclado magnético");
    expect(c.descriptionHtml).toContain("<h3>Diseño y Construcción</h3>");
    expect(c.descriptionHtml).toContain("Placa de aleación de aluminio &amp; perilla metálica.");
  });

  it("deja afuera el título, la galería, las opiniones y la tabla repetida", () => {
    expect(c.descriptionHtml).not.toMatch(/Teclado Magnético<|Galería|Opiniones|Excelente teclado|Especificaciones|<img|<svg/);
  });

  it("las tarjetas cortas quedan como «título: dato»", () => {
    expect(c.descriptionHtml).toContain("<li>Conectividad Trimodo: Bluetooth, 2.4 GHz y USB Tipo-C</li>");
  });

  it("una tabla con varias versiones agrupa por columna", () => {
    const t = officialStoreContent(
      `<table><tr><th>Modelo</th><th>Basic</th><th>Pro</th></tr><tr><td>Switch</td><td>Red</td><td>Magnético</td></tr></table>`
    );
    expect(t.specs).toEqual([
      { group: "Basic", name: "Switch", value: "Red" },
      { group: "Pro", name: "Switch", value: "Magnético" },
    ]);
  });

  it("sin página, nada", () => {
    expect(officialStoreContent(null)).toEqual({ shortDescription: null, descriptionHtml: null, specs: [] });
  });
});

describe("dónde se busca cada fila", () => {
  it("con link, en esa tienda; sin link, en la de su marca; sin marca, en todas", () => {
    expect(officialPlaceOf({ productUrl: "https://atkgaming.com.ar/products/zero", brand: "AULA" }).stores.map((s) => s.source)).toEqual(["atk"]);
    expect(officialPlaceOf({ productUrl: null, brand: "IROK" })).toMatchObject({ handle: null, key: "marca:irok" });
    expect(officialPlaceOf({ productUrl: null, brand: "PROXIMAMENTE" }).stores).toHaveLength(3);
    expect(officialStoreForBrand(" atk ")?.source).toBe("atk");
  });
});
