import {
  buildMicroglobalEnvelope,
  mapMicroglobalProduct,
  parseMicroglobalCredentials,
  parseMicroglobalResponse,
} from "./microglobal.adapter";

const OK = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetCatalogResponse xmlns="http://tempuri.org/">
      <GetCatalogResult>
        <result>0</result>
        <message />
        <listProducts>
          <Product>
            <partNumber>MG-KB-001</partNumber>
            <partNumber_ori>920-009294</partNumber_ori>
            <descripcion>Teclado Logitech K120 USB &amp; español</descripcion>
            <categoria>Teclados</categoria>
            <marca>Logitech</marca>
            <precio>8.50</precio>
            <iva_pct>21</iva_pct>
            <ii_pct>0</ii_pct>
            <stock>37</stock>
            <upc>097855070753</upc>
            <peso>550</peso>
            <ancho>45</ancho>
            <alto>3</alto>
            <profundidad>15</profundidad>
          </Product>
          <Product>
            <partNumber>MG-CEL-002</partNumber>
            <descripcion>Celular Motorola G24</descripcion>
            <categoria>Celulares</categoria>
            <marca>Motorola</marca>
            <precio>100</precio>
            <iva_pct>10.5</iva_pct>
            <ii_pct>9.5</ii_pct>
            <stock>0</stock>
          </Product>
        </listProducts>
      </GetCatalogResult>
    </GetCatalogResponse>
  </soap:Body>
</soap:Envelope>`;

describe("parseMicroglobalResponse", () => {
  it("devuelve las filas de listProducts con entidades decodificadas", () => {
    const rows = parseMicroglobalResponse(OK);
    expect(rows).toHaveLength(2);
    expect(rows[0].partNumber).toBe("MG-KB-001");
    expect(rows[0].descripcion).toBe("Teclado Logitech K120 USB & español");
    expect(rows[1].ii_pct).toBe("9.5");
  });

  it("tolera prefijos de namespace en los elementos", () => {
    const prefixed = OK.replace(/<(\/?)(GetCatalogResult|result|listProducts|Product|partNumber|descripcion)>/g, "<$1a:$2>");
    const rows = parseMicroglobalResponse(prefixed);
    expect(rows[0].partNumber).toBe("MG-KB-001");
  });

  it("un result distinto de 0 es error con el mensaje de Microglobal", () => {
    const bad = OK.replace("<result>0</result>", "<result>3</result>").replace("<message />", "<message>Usuario o contraseña incorrectos</message>");
    expect(() => parseMicroglobalResponse(bad)).toThrow(/Usuario o contraseña incorrectos/);
  });

  it("un soap:Fault es error", () => {
    const fault = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Server was unable to process request.</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
    expect(() => parseMicroglobalResponse(fault)).toThrow(/unable to process/);
  });

  it("sin GetCatalogResult o vacío es error", () => {
    expect(() => parseMicroglobalResponse("")).toThrow(/vacía/);
    expect(() => parseMicroglobalResponse("<html>502</html>")).toThrow(/GetCatalogResult/);
  });
});

describe("mapMicroglobalProduct", () => {
  it("mapea códigos, EAN, neto, IVA, peso en kg y moneda de la cuenta", () => {
    const [row] = parseMicroglobalResponse(OK);
    const p = mapMicroglobalProduct(row, "USD")!;
    expect(p.externalId).toBe("MG-KB-001");
    expect(p.sku).toBe("MG-KB-001");
    expect(p.partNumber).toBe("920-009294");
    expect(p.ean).toBe("097855070753");
    expect(p.name).toBe("Teclado Logitech K120 USB & español");
    expect(p.brand).toBe("Logitech");
    expect(p.category).toBe("Teclados");
    expect(p.price).toBe(8.5);
    expect(p.ivaPercent).toBe(21);
    expect(p.finalPrice).toBe(10.285);
    expect(p.currency).toBe("USD");
    expect(p.stock).toBe(37);
    expect(p.weight).toBe(0.55);
    expect(p.weightUnit).toBe("kg");
    expect(p.imageUrl).toBeUndefined();
  });

  it("los internos van al final (neto × (1 + IVA + internos)), no al neto", () => {
    const [, row] = parseMicroglobalResponse(OK);
    const p = mapMicroglobalProduct(row, "ARS")!;
    expect(p.price).toBe(100);
    expect(p.finalPrice).toBe(120);
    expect(p.currency).toBe("ARS");
    expect(p.stock).toBe(0);
    expect(p.partNumber).toBe("MG-CEL-002");
  });

  it("sin partNumber o sin descripción no hay producto", () => {
    expect(mapMicroglobalProduct({ descripcion: "X" })).toBeNull();
    expect(mapMicroglobalProduct({ partNumber: "A" })).toBeNull();
  });

  it("sin precio no inventa moneda ni final", () => {
    const p = mapMicroglobalProduct({ partNumber: "A", descripcion: "X", precio: "0", iva_pct: "21" })!;
    expect(p.price).toBeUndefined();
    expect(p.currency).toBeUndefined();
    expect(p.finalPrice).toBeUndefined();
  });
});

describe("credenciales y sobre SOAP de Microglobal", () => {
  it("moneda USD por defecto; ARS solo si la eligen", () => {
    expect(parseMicroglobalCredentials({ cliente: "123", password: "x" }).currency).toBe("USD");
    expect(parseMicroglobalCredentials({ cliente: "123", password: "x", moneda: "ars" }).currency).toBe("ARS");
  });

  it("escapa la contraseña dentro del XML", () => {
    const xml = buildMicroglobalEnvelope("GetCatalog", { cliente: "123", usuario: "", password: "a<b&c", currency: "USD" });
    expect(xml).toContain("<password>a&lt;b&amp;c</password>");
    expect(xml).toContain('<GetCatalog xmlns="http://tempuri.org/">');
    expect(xml).toContain("<usuario></usuario>");
  });
});
