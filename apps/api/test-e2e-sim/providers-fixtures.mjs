// Planillas de prueba para los escenarios de proveedores por lista.
// Genera .xlsx reales con la misma lib que usa el API (xlsx / SheetJS) y csv en texto.
import XLSX from "xlsx";

/** Libro .xlsx en memoria: `sheets` = [{ name, rows }] con filas como arrays de celdas. */
export function xlsxBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const csv = (rows, sep = ",") => rows.map((r) => r.map((c) => (c == null ? "" : String(c))).join(sep)).join("\n");

/**
 * Cada variante trae: archivo, nombre, productos esperados (por token de nombre
 * → precio esperado) y una descripción. `tag` hace únicos los nombres para buscar.
 */
export function listVariants(tag) {
  const n = (suffix) => `Producto ${tag}${suffix}`;
  return [
    {
      key: "V1",
      desc: "xlsx estándar (SKU, Descripción, Precio, Stock, IVA, Moneda), números como número",
      filename: "lista-estandar.xlsx",
      data: xlsxBuffer([
        {
          name: "Lista",
          rows: [
            ["SKU", "Descripción", "Precio", "Stock", "IVA", "Moneda"],
            [`${tag}-A1`, `${n("a1")} Mouse`, 12.5, 40, 21, "USD"],
            [`${tag}-A2`, `${n("a2")} Teclado`, 35.9, 15, 21, "USD"],
            [`${tag}-A3`, `${n("a3")} Monitor`, 149, 8, 10.5, "USD"],
            [`${tag}-A4`, `${n("a4")} Cable`, 3.2, 200, 21, "USD"],
          ],
        },
      ]),
      expect: { [`${tag}a1`]: 12.5, [`${tag}a2`]: 35.9, [`${tag}a3`]: 149, [`${tag}a4`]: 3.2 },
    },
    {
      key: "V2",
      desc: "columnas en otro orden y con otros nombres (Código, Producto, Moneda, Precio Lista, Disponible, Alícuota IVA)",
      filename: "lista-otro-orden.xlsx",
      data: xlsxBuffer([
        {
          name: "Precios",
          rows: [
            ["Moneda", "Disponible", "Código", "Alícuota IVA", "Producto", "Precio Lista"],
            ["USD", 10, `${tag}-B1`, 21, `${n("b1")} Router`, 55],
            ["USD", 0, `${tag}-B2`, 21, `${n("b2")} Switch`, 80.75],
            ["USD", 3, `${tag}-B3`, 10.5, `${n("b3")} Notebook`, 899.99],
          ],
        },
      ]),
      expect: { [`${tag}b1`]: 55, [`${tag}b3`]: 899.99 },
    },
    {
      key: "V3",
      desc: "precios como texto: coma decimal, miles con punto, '$ ', 'U$S', texto ('consultar') y filas vacías",
      filename: "lista-texto.xlsx",
      data: xlsxBuffer([
        {
          name: "Hoja1",
          rows: [
            ["Codigo", "Descripcion", "Precio", "Stock", "Moneda"],
            [`${tag}-C1`, `${n("c1")} Impresora`, "1.234,50", "5", "ARS"],
            [],
            [`${tag}-C2`, `${n("c2")} Toner`, "$ 2.500,00", "12", "ARS"],
            [null, null, null, null, null],
            [`${tag}-C3`, `${n("c3")} Parlante`, "U$S 15,90", "7", "USD"],
            [`${tag}-C4`, `${n("c4")} Silla`, "consultar", "1", "ARS"],
            [`${tag}-C5`, `${n("c5")} Escritorio`, "150.000", "2", "ARS"],
          ],
        },
      ]),
      expect: { [`${tag}c1`]: 1234.5, [`${tag}c2`]: 2500, [`${tag}c3`]: 15.9, [`${tag}c5`]: 150000 },
    },
    {
      key: "V4",
      desc: "varias hojas (portada + lista) y encabezado en la fila 3 (título y fecha arriba)",
      filename: "lista-varias-hojas.xlsx",
      data: xlsxBuffer([
        { name: "Portada", rows: [["Lista de precios"], ["Distribuidora Simulada"], ["Vigencia: octubre 2026"]] },
        {
          name: "Productos",
          rows: [
            ["LISTA DE PRECIOS OCTUBRE 2026"],
            ["Precios en dólares sin IVA"],
            ["Código", "Detalle", "Precio USD", "Stock"],
            [`${tag}-D1`, `${n("d1")} Webcam`, 29, 4],
            [`${tag}-D2`, `${n("d2")} Auricular`, 19.99, 9],
            [`${tag}-D3`, `${n("d3")} Disco`, 64, 30],
          ],
        },
      ]),
      expect: { [`${tag}d1`]: 29, [`${tag}d2`]: 19.99, [`${tag}d3`]: 64 },
    },
    {
      key: "V5",
      desc: "csv separado por comas, precios con punto decimal",
      filename: "lista.csv",
      data: Buffer.from(
        csv([
          ["Codigo", "Descripcion", "Precio", "Stock", "IVA", "Moneda"],
          [`${tag}-E1`, `${n("e1")} Fuente`, "45.50", "10", "21", "USD"],
          [`${tag}-E2`, `${n("e2")} Gabinete`, "70.00", "3", "21", "USD"],
        ])
      ),
      expect: { [`${tag}e1`]: 45.5, [`${tag}e2`]: 70 },
    },
    {
      key: "V6",
      desc: "csv argentino separado por ';' con coma decimal y miles con punto",
      filename: "lista-ar.csv",
      data: Buffer.from(
        csv(
          [
            ["Codigo", "Descripcion", "Precio", "Stock"],
            [`${tag}-F1`, `${n("f1")} Memoria`, "1.250,75", "8"],
            [`${tag}-F2`, `${n("f2")} Placa`, "98.300,00", "2"],
          ],
          ";"
        )
      ),
      expect: { [`${tag}f1`]: 1250.75, [`${tag}f2`]: 98300 },
    },
  ];
}

/** Archivos inválidos: vacío, texto con extensión .xlsx, solo encabezado. */
export function brokenFiles() {
  return [
    { key: "X1", desc: "archivo vacío (0 bytes) .xlsx", filename: "vacio.xlsx", data: Buffer.alloc(0) },
    { key: "X2", desc: "texto plano con extensión .xlsx", filename: "falso.xlsx", data: Buffer.from("esto no es un excel\nni un csv con precios\n") },
    { key: "X3", desc: "binario aleatorio con extensión .xlsx", filename: "binario.xlsx", data: Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 37) % 256)) },
    {
      key: "X4",
      desc: "xlsx con solo el encabezado (sin filas)",
      filename: "solo-encabezado.xlsx",
      data: xlsxBuffer([{ name: "Lista", rows: [["SKU", "Descripción", "Precio", "Stock"]] }]),
    },
  ];
}

/** Lista grande: `count` filas con precios variados. */
export function bigList(tag, count = 20_000) {
  const rows = [["SKU", "Descripción", "Precio", "Stock", "IVA", "Moneda"]];
  for (let i = 1; i <= count; i++) {
    rows.push([`${tag}-G${i}`, `Producto ${tag}g${i} Masivo`, Math.round((5 + (i % 997) * 1.37) * 100) / 100, i % 50, 21, "USD"]);
  }
  return { filename: "lista-grande.xlsx", data: xlsxBuffer([{ name: "Lista", rows }]), samplePrice: (i) => Math.round((5 + (i % 997) * 1.37) * 100) / 100 };
}
