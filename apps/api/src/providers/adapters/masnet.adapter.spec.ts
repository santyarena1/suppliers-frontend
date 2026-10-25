import {
  MASNET_CSV_COLUMNS,
  mapMasnetRow,
  maskMasnetSecrets,
  normalizeMasnetCurrency,
  parseCsvNumber,
  parseMasnetCsv,
  parseMasnetStock,
  masnetShouldRetry,
} from "./masnet.adapter";

const HEADER = MASNET_CSV_COLUMNS.join(",");

function row(values: Partial<Record<(typeof MASNET_CSV_COLUMNS)[number], string>>): string {
  return MASNET_CSV_COLUMNS.map((c) => {
    const v = values[c] ?? "";
    return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
}

const BASE = {
  categoria: "Monitores",
  sub_categoria: "Gamer",
  marca: "LG",
  precio: "180.50",
  impuesto_interno: "0",
  iva: "10.5",
  moneda: "USD",
  stock_total: "12",
  imagen: "https://masnet.com.ar/img/27gn.jpg",
  link: "https://masnet.com.ar/producto/27gn",
};

function csv(extra = 0): string {
  const lines = [HEADER, row({ ...BASE, id: "901", codigo_alfa: "MON-LG-27GN", codigo_producto: "27GN650-B", nombre: "Monitor LG 27GN650" })];
  for (let i = 0; i < 4 + extra; i += 1) lines.push(row({ ...BASE, id: String(1000 + i), codigo_alfa: `X-${i}`, nombre: `Producto ${i}` }));
  return lines.join("\n");
}

describe("parseMasnetCsv", () => {
  it("lee el CSV con BOM y cabeceras en mayúsculas", () => {
    const body = "﻿" + csv().replace(HEADER, HEADER.toUpperCase());
    const rows = parseMasnetCsv(body);
    expect(rows).toHaveLength(5);
    expect(rows[0].codigo_alfa).toBe("MON-LG-27GN");
  });

  it("entiende comillas escapadas con barra (como fgetcsv) y dobles", () => {
    const body = csv()
      .replace("Monitor LG 27GN650", '"Monitor LG 27\\" IPS"')
      .replace("Producto 0", '"Mouse ""Pro"""');
    const rows = parseMasnetCsv(body);
    expect(rows[0].nombre).toBe('Monitor LG 27" IPS');
    expect(rows[1].nombre).toBe('Mouse "Pro"');
  });

  it("rechaza una página HTML de error", () => {
    expect(() => parseMasnetCsv("<!DOCTYPE html><html><body>Token inválido</body></html>")).toThrow(/no devolvió el CSV/);
  });

  it("rechaza si falta una columna obligatoria", () => {
    const body = csv().replace(",impuesto_interno,", ",otra_cosa,");
    expect(() => parseMasnetCsv(body)).toThrow(/impuesto_interno/);
  });

  it("no acepta un CSV con menos de 5 productos (no pisa el catálogo)", () => {
    const body = [HEADER, row({ ...BASE, id: "1", codigo_alfa: "A", nombre: "Uno" })].join("\n");
    expect(() => parseMasnetCsv(body)).toThrow(/al menos 5/);
  });
});

describe("mapMasnetRow", () => {
  it("mapea códigos, categoría compuesta, precio neto, IVA y final", () => {
    const [first] = parseMasnetCsv(csv());
    const p = mapMasnetRow(first)!;
    expect(p.externalId).toBe("MON-LG-27GN");
    expect(p.sku).toBe("MON-LG-27GN");
    expect(p.partNumber).toBe("27GN650-B");
    expect(p.name).toBe("Monitor LG 27GN650");
    expect(p.brand).toBe("LG");
    expect(p.category).toBe("Monitores > Gamer");
    expect(p.subcategory).toBe("Gamer");
    expect(p.price).toBe(180.5);
    expect(p.currency).toBe("USD");
    expect(p.ivaPercent).toBe(10.5);
    expect(p.finalPrice).toBeCloseTo(199.4525, 4);
    expect(p.stock).toBe(12);
    expect(p.imageUrl).toBe("https://masnet.com.ar/img/27gn.jpg");
    expect(p.productUrl).toBe("https://masnet.com.ar/producto/27gn");
    expect(p.raw).toBe(first);
  });

  it("no vuelve a sumar el impuesto interno: el precio ya lo trae", () => {
    const p = mapMasnetRow({ id: "1", codigo_alfa: "A", nombre: "Celular", precio: "100", impuesto_interno: "10.5", iva: "21" })!;
    expect(p.price).toBe(100);
    expect(p.finalPrice).toBe(121);
  });

  it("usa el id cuando no hay código alfa y descarta filas sin nombre", () => {
    expect(mapMasnetRow({ id: "77", codigo_alfa: "", nombre: "Teclado" })?.externalId).toBe("77");
    expect(mapMasnetRow({ id: "77", codigo_alfa: "A", nombre: "" })).toBeNull();
  });

  it("sin precio no inventa moneda ni final", () => {
    const p = mapMasnetRow({ id: "1", nombre: "X", precio: "0", iva: "21", moneda: "USD" })!;
    expect(p.price).toBeUndefined();
    expect(p.currency).toBeUndefined();
    expect(p.finalPrice).toBeUndefined();
  });

  it("toma la miniatura si no hay imagen", () => {
    expect(mapMasnetRow({ id: "1", nombre: "X", imagen: "", miniatura: "https://m/x.jpg" })?.imageUrl).toBe("https://m/x.jpg");
  });
});

describe("helpers de Masnet", () => {
  it("parseCsvNumber acepta punto, coma y miles", () => {
    expect(parseCsvNumber("1234.5")).toBe(1234.5);
    expect(parseCsvNumber("1234,5")).toBe(1234.5);
    expect(parseCsvNumber("1.234,50")).toBe(1234.5);
    expect(parseCsvNumber("1,234.50")).toBe(1234.5);
    expect(parseCsvNumber("")).toBeUndefined();
    expect(parseCsvNumber("abc")).toBeUndefined();
  });

  it("parseMasnetStock lee el texto de stock sin inventar", () => {
    expect(parseMasnetStock("12")).toEqual({ stock: 12 });
    expect(parseMasnetStock("+50")).toEqual({ stock: 50, stockStatus: "+50" });
    expect(parseMasnetStock("Sin stock")).toEqual({ stock: 0, stockStatus: "Sin stock" });
    expect(parseMasnetStock("Consultar")).toEqual({ stockStatus: "Consultar" });
    expect(parseMasnetStock("")).toEqual({});
  });

  it("normalizeMasnetCurrency sigue el criterio de AcuStock", () => {
    expect(normalizeMasnetCurrency("1")).toBe("ARS");
    expect(normalizeMasnetCurrency("ARS")).toBe("ARS");
    expect(normalizeMasnetCurrency("U$S")).toBe("USD");
    expect(normalizeMasnetCurrency("2")).toBe("USD");
    expect(normalizeMasnetCurrency("")).toBe("USD");
  });

  it("el token nunca queda en un mensaje de error", () => {
    const creds = { userId: "api-22623", token: "s3cr3t-tok" };
    const msg = maskMasnetSecrets("GET https://masnet.com.ar/api/v1/productos/csv?user_id=api-22623&token=s3cr3t-tok falló", creds);
    expect(msg).not.toContain("s3cr3t-tok");
    expect(msg).toContain("token=••••");
  });
});

describe("masnetShouldRetry", () => {
  it("reintenta cortes y errores 5xx", () => {
    expect(masnetShouldRetry({ code: "ECONNRESET" })).toBe(true);
    expect(masnetShouldRetry({ response: { status: 502 } })).toBe(true);
  });
  it("no reintenta credenciales, bloqueo ni límite", () => {
    expect(masnetShouldRetry({ response: { status: 401 } })).toBe(false);
    expect(masnetShouldRetry({ response: { status: 403 } })).toBe(false);
    expect(masnetShouldRetry({ response: { status: 429 } })).toBe(false);
  });
});
