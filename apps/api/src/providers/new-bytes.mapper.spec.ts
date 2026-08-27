import {
  applyDescription,
  descriptionMap,
  extractItemPatch,
  buildNbProcessBody,
  extractProcessResult,
  filterPaymentsForDelivery,
  mapCsvProduct,
  mapJsonProduct,
  mapPaymentOption,
  nbProductUrl,
  normalizeComprobante,
  normalizeOrderRow,
  parseNbAvailability,
  parseNbOrderItems,
  parseShippingQuote,
  pickBalanceFromClient,
} from "./new-bytes.mapper";
import { extractNbToken, parseNbCredentials, unwrapNbList } from "./new-bytes-client";

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
    expect(order.items).toBeUndefined();

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

  it("lee ítems e importes del detalle de pedido con los campos del carrito NB", () => {
    const detail = normalizeOrderRow({
      data: {
        albNumber: "88421",
        branch: 1,
        statusDescription: "Facturado",
        date: "21-08-2026",
        amount: 150.5,
        note: "retiro viernes",
        dropShipping: false,
        trackingNumber: "ANDREANI-9",
        invoice: "FC-001",
        medioDePago: { description: "Depósito en Banco" },
        medioDeEnvio: { description: "Retiro en sucursal" },
        shippingAddress: { direccion: "Av. Jujuy 1039", localidad: "CABA", codigoPostal: "1229" },
        subtotal: { subTotal: 124, subTotalFinal: 150.5, iva: 26.04, perceptionsIIBB: 0.46, currencyQuote: 1400 },
        items: [
          {
            productId: 108613,
            amount: 2,
            subtotal: 100,
            product: { id: 108613, title: "RTX 3070", price: { value: 50 } },
          },
          { productId: 12, amount: 1, title: "Mouse", price: { value: 24 } },
        ],
      },
    });
    expect(detail.orderNumber).toBe("88421");
    expect(detail.notes).toBe("retiro viernes");
    expect(detail.payment).toBe("Depósito en Banco");
    expect(detail.delivery).toBe("Retiro en sucursal");
    expect(detail.address).toMatch(/Jujuy 1039/);
    expect(detail.trackingNumber).toBe("ANDREANI-9");
    expect(detail.invoice).toBe("FC-001");
    expect(detail.items).toEqual([
      { code: "108613", name: "RTX 3070", qty: 2, price: 50, total: 100 },
      { code: "12", name: "Mouse", qty: 1, price: 24, total: 24 },
    ]);
    expect(detail.subtotalUsd).toBe(124);
    expect(detail.iva).toBe(26.04);
    expect(detail.perceptions).toBe(0.46);
    expect(detail.perceptionLabel).toBe("IIBB");
    expect(detail.totalUsd).toBe(150.5);
    expect(detail.exchangeRate).toBe(1400);
    expect(detail.totalArs).toBe(150.5 * 1400);
    expect(parseNbOrderItems({ items: [] })).toEqual([]);
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

  it("el process de retiro solo manda note y medioDePagoId", () => {
    expect(
      buildNbProcessBody({
        delivery: "pickup",
        medioDePagoId: 4,
        notes: "comentario",
        addressId: "19337",
        medioDeEnvioId: 3030,
      })
    ).toEqual({ note: "comentario", medioDePagoId: 4 });
  });

  it("el process de envío manda cotización, dirección, bultos y dropshipping", () => {
    expect(
      buildNbProcessBody({
        delivery: "shipping",
        medioDePagoId: 3,
        notes: "",
        postalCode: "1407",
        medioDeEnvioId: 3030,
        addressId: "19337",
        datosBultos: { weightKg: 0.6, sizeCm: "12.16x12.16x12.16", amount: 1 },
        dropShipping: true,
        dropShippingClientName: "Moe Szyslak",
        dropShippingClientEmail: "MoeSzyslak@gmail.com",
      })
    ).toEqual({
      note: "",
      medioDePagoId: 3,
      codigoPostalFavorito: "1407",
      mediodeEnvioId: 3030,
      idDirCli: "19337",
      datosBultos: { weightKg: 0.6, sizeCm: "12.16x12.16x12.16", amount: 1 },
      dropShipping: true,
      dpPayload: { clientName: "Moe Szyslak", clientEmail: "MoeSzyslak@gmail.com" },
    });
  });

  it("Efectivo Caja no aparece entre los pagos de un envío", () => {
    const payments = [
      { value: "3", label: "Depósito en Banco", interest: 0, pickupOnly: false },
      { value: "5", label: "Efectivo Caja", interest: 0, pickupOnly: true },
    ];
    expect(filterPaymentsForDelivery(payments, "shipping").map((p) => p.value)).toEqual(["3"]);
    expect(filterPaymentsForDelivery(payments, "pickup").map((p) => p.value)).toEqual(["3", "5"]);
  });

  it("parsea la cotización de calcularEnvioPara como en la doc oficial", () => {
    const parsed = parseShippingQuote({
      cotizacion: [
        { id: 4065, description: "A domicilio por Andreani", plazoEntrega: "entre mañana y el miércoles 17", total: 5114.4 },
        { id: 3030, description: "Moto (Capital Federal)", plazoEntrega: "hoy", total: 3500 },
      ],
      datosBulto: { weightKg: 0.6, sizeCm: "12.16x12.16x12.16", amount: 1 },
    });
    expect(parsed.quotes).toHaveLength(2);
    expect(parsed.quotes[0]).toMatchObject({ id: "4065", label: "A domicilio por Andreani", total: 5114.4 });
    expect(parsed.datosBultos).toEqual({ weightKg: 0.6, sizeCm: "12.16x12.16x12.16", amount: 1 });
  });

  it("marca faltantes de availability si NewBytes dice available:false", () => {
    const parsed = parseNbAvailability([{ productId: 108613, available: false, message: "Sin stock" }]);
    expect(parsed.ok).toBe(false);
    expect(parsed.issues[0]).toMatchObject({ code: "108613", message: "Sin stock" });
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

  it("normaliza aliases de credenciales (usuario/username, pass, readToken)", () => {
    expect(parseNbCredentials({ usuario: "nb", pass: "x", readToken: "tok" })).toEqual({
      user: "nb",
      password: "x",
      token: "tok",
    });
    expect(parseNbCredentials({ user: "a", password: "b" })).toEqual({
      user: "a",
      password: "b",
      token: undefined,
    });
  });
});
