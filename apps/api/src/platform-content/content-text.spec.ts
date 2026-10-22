import { contentToText, htmlToText } from "./content-text";

describe("htmlToText", () => {
  it("convierte párrafos, títulos y listas en texto legible", () => {
    const html =
      "<p>Combo compacto.</p><h3>Lo destacado</h3><ul><li><strong>Bluetooth:</strong> sin cables.</li><li>Teclas &amp; botones</li></ul>";

    expect(htmlToText(html)).toBe("Combo compacto.\n\nLo destacado\n\n• Bluetooth: sin cables.\n\n• Teclas & botones");
  });

  it("descarta etiquetas y atributos", () => {
    expect(htmlToText('<p onclick="x()">Hola<script>alert(1)</script></p>')).toBe("Holaalert(1)");
  });
});

describe("contentToText", () => {
  it("arma nombre, bajada, descripción y especificaciones agrupadas", () => {
    const text = contentToText({
      name: "Placa RTX 5060",
      shortDescription: "8 GB GDDR7.",
      descriptionHtml: "<p>Para jugar en 1080p.</p>",
      specs: [
        { group: "Memoria", name: "Capacidad", value: "8 GB" },
        { group: null, name: "Color", value: "Negro" },
      ],
    });

    expect(text).toBe(
      "Placa RTX 5060\n\n8 GB GDDR7.\n\nPara jugar en 1080p.\n\nEspecificaciones\n\nMemoria\nCapacidad: 8 GB\n\nGenerales\nColor: Negro"
    );
  });
});
