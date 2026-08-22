import {
  applyDescription,
  descriptionMap,
  extractItemPatch,
  extractProcessResult,
  mapCsvProduct,
  mapJsonProduct,
  mapPaymentOption,
  nbProductUrl,
  normalizeComprobante,
  normalizeOrderRow,
  pickBalanceFromClient,
} from "./new-bytes.mapper";
import { extractNbToken, unwrapNbList } from "./new-bytes-client";

describe("new-bytes.mapper", () => {
  it("mapea el CSV de lista de precios campo a campo", () => {
    const product = mapCsvProduct({
      CODIGO: "108613",
      "ID FABRICANTE": "GV-N3070GAMING OC-8GD",
      CATEGORIA: "PLACA DE VIDEO",
      DETALLE: "PLACA DE VIDEO GIGABYTE RTX 3070 GAMING OC 8 GB",
      IMAGEN: "https://static.nb.com.ar/i/foto.jpeg",
      IVA: "10.5%",
      STOCK: "4",
      GARANTIA: "12 meses",
      MONEDA: "U$S",
      PRECIO: "1538.74",
      "PRECIO FINAL": "1700.30",
      ATRIBUTOS: "Memoria: 8GB GDDR6",
      MARCA: "GIGABYTE",
    });
    expect(product.externalId).toBe("108613");
    expect(product.sku).toBe("GV-N3070GAMING OC-8GD");
    expect(product.currency).toBe("USD");
    expect(product.ivaPercent).toBe(10.5);
    expect(product.stock).toBe(4);
    expect(product.longDescription).toMatch(/8GB/);
    expect(product.productUrl).toContain("108613");
    expect(product.imageUrl).toMatch(/static\.nb\.com\.ar/);
  });

  it("no inventa cantidad de stock si el CSV trae texto", () => {
    const product = mapCsvProduct({
      CODIGO: "1",
      DETALLE: "Producto",
      STOCK: "Sin stock",
      MONEDA: "U$S",
    });
    expect(product.stock).toBeUndefined();
    expect(product.stockStatus).toBe("Sin stock");
  });

  it("mapea el catálogo JSON autenticado (contrato del sitio / plugin WooCommerce)", () => {
    const product = mapJsonProduct({
      id: 108613,
      sku: "GV-N3070GAMING OC-8GD",
      title: "PLACA DE VIDEO GIGABYTE RTX 3070 GAMING OC 8 GB",
      category: "PLACA DE VIDEO",
      brand: "GIGABYTE",
      mainImage: "https://static.nb.com.ar/i/foto.jpeg",
      stock: "Sin stock",
      amountStock: 0,
      warranty: "12 meses",
      cotizacion: 860,
      price: { value: 1538.74146, iva: 10.5, finalPrice: 1700.3093133 },
      weightAverage: 1200,
      widthAverage: 270,
      lengthAverage: 120,
      highAverage: 50,
    });
    expect(product).not.toBeNull();
    expect(product!.externalId).toBe("108613");
    expect(product!.stock).toBe(0);
    expect(product!.stockStatus).toBe("Sin stock");
    expect(product!.currency).toBe("USD");
    expect(product!.weight).toBeCloseTo(1.2);
    expect(product!.weightUnit).toBe("kg");
    expect(product!.width).toBeCloseTo(27);
    expect(product!.dimensionsUnit).toBe("cm");
    expect(product!.productUrl).toBe(nbProductUrl("108613", product!.name));
  });

  it("cruza descripciones largas por codigo de producto", () => {
    const map = descriptionMap([
      { codigo: 108613, description: "Ficha técnica completa RTX 3070" },
      { codigo: "x", description: "" },
    ]);
    expect(map.get("108613")).toMatch(/RTX 3070/);
    const product = applyDescription(
      { externalId: "108613", name: "GPU", raw: {} },
      map.get("108613")
    );
    expect(product.longDescription).toMatch(/Ficha técnica/);
    expect(product.description).toMatch(/Ficha técnica/);
  });

  it("normaliza pedidos y comprobantes con los campos reales del sitio", () => {
    const order = normalizeOrderRow({
      albNumber: "88421",
      branch: "1",
      statusDescription: "Pendiente",
      date: "21-08-2026",
      amount: 150.5,
      clientName: "The Gamer Shop",
    });
    expect(order.orderNumber).toBe("88421");
    expect(order.webOrderNumber).toBe("88421");
    expect(order.status).toBe("Pendiente");

    const movement = normalizeComprobante({
      voucherId: 99,
      invoiceDate: "2026-08-21",
      invoiceType: "FC",
      branch: "1",
      invoiceNumber: "00012345",
      invoiceLabel: "Factura A",
      subtotal: { subTotal: 100, subTotalFinal: 121, currencyQuote: 1000, perceptionsIIBB: 5 },
    });
    expect(movement.invoiceType).toBe("FC");
    expect(movement.subtotalUsd).toBe(100);
    expect(movement.totalArs).toBe(121000);
    expect(movement.perceptions).toBe(5);
  });

  it("excluye medios de pago que redirigen a tarjeta / MercadoPago", () => {
    expect(mapPaymentOption({ payMethodId: 5, description: "Efectivo Caja", interest: 0 })).toMatchObject({
      value: "5",
      pickupOnly: true,
    });
    expect(mapPaymentOption({ payMethodId: 3, description: "Depósito en Banco" })?.value).toBe("3");
    expect(mapPaymentOption({ payMethodId: 11, description: "Tarjeta" })).toBeNull();
    expect(mapPaymentOption({ payMethodId: 15, description: "MercadoPago" })).toBeNull();
  });

  it("lee branch y orderId de la respuesta de process", () => {
    expect(extractProcessResult({ branch: 1, orderId: 9901 })).toEqual({
      orderId: "9901",
      branch: "1",
      raw: { branch: 1, orderId: 9901 },
    });
  });

  it("extrae saldo de la ficha de cliente si NewBytes lo informa", () => {
    expect(pickBalanceFromClient({ saldo: -1500.5 })).toBe(-1500.5);
    expect(pickBalanceFromClient({ name: "sin saldo" })).toBeNull();
  });

  it("arma un parche de ficha sin inventar campos vacíos", () => {
    const patch = extractItemPatch({
      id: 1,
      title: "Mouse",
      sku: "MOU-1",
      brand: "Logitech",
      description: "Sensor 16K",
    });
    expect(patch.sku).toBe("MOU-1");
    expect(patch.brand).toBe("Logitech");
    expect(patch.longDescription).toBe("Sensor 16K");
    expect(patch.ean).toBeUndefined();
  });
});

describe("new-bytes-client helpers", () => {
  it("saca el JWT del login tal como lo documenta el plugin oficial", () => {
    expect(extractNbToken({ token: "eyJhbGciOiJIUzI1NiJ9.aaa.bbb" })).toMatch(/^eyJ/);
    expect(extractNbToken("no")).toBeUndefined();
  });

  it("desenvuelve listados que vienen como array o { data: [] }", () => {
    expect(unwrapNbList([1, 2])).toEqual([1, 2]);
    expect(unwrapNbList({ data: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(unwrapNbList(null)).toEqual([]);
  });
});
