import { elitLoginBody, mapElitCartDetails } from "./elit-web-client";
import { parseElitCtaRsc, parseElitPaymentOptions, parseElitPaymentsPayload, parseElitPedidosRsc } from "./elit-rsc.parser";
import { parseHtmlTables, parseFileUploadForms, parseSelectOptions, pickBalance } from "./html-table";

describe("elitLoginBody", () => {
  it("nro de cliente numérico manda agent 0", () => {
    expect(elitLoginBody("12345", "secret")).toEqual({ id: "12345", password: "secret", agent: 0 });
  });

  it("nro-agente parte el id", () => {
    expect(elitLoginBody("12345-2", "secret")).toEqual({ id: "12345", password: "secret", agent: 2 });
  });

  it("email no manda agent", () => {
    expect(elitLoginBody("user@elit.com", "secret")).toEqual({ id: "user@elit.com", password: "secret" });
  });
});

describe("mapElitCartDetails", () => {
  it("mapea details[].cart sin inventar nombres de campo extra", () => {
    const items = mapElitCartDetails(
      [{ code: 99, name: "SSD", price: 10, cart: [{ quantity: 2, warehouse: 9 }] }],
      [{ code: "99", qty: 2 }],
    );
    expect(items[0]).toEqual({ code: "99", qty: 2, name: "SSD", price: 10, subtotal: 20, warehouse: 9 });
  });
});

describe("elit-rsc.parser", () => {
  it("extrae notas de venta del payload RSC", () => {
    const rsc = `0:{"form":"NOTA DE VENTA","number":"9900745926","internalNumber":"9900745926","invoiceNumber":"","message":"Pendiente","date":"22/08/2026","debit":12.1,"currency":2,"warehouseName":"Buenos Aires","saleConditionInfo":{"name":"Transferencia"},"shippingMethodInfo":{"name":"Retira depósito"}}`;
    const orders = parseElitPedidosRsc(rsc);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderNumber: "9900745926",
      status: "Pendiente",
      currency: "USD",
      warehouseName: "Buenos Aires",
      saleCondition: "Transferencia",
      shippingMethod: "Retira depósito",
      amount: 12.1,
    });
  });

  it("conserva pdfUrl, remito, ítems y tracking de la nota de venta", () => {
    const rsc = `0:{"form":"NOTA DE VENTA","number":"9900745926","pdfUrl":"https://cdn.elit.com.ar/nv/9900745926.pdf","dispatchNotePdfUrl":"https://cdn.elit.com.ar/remitos/1.pdf","saleNoteStatus":{"label":"En preparación","description":"Armando"},"tracking":"AND123","trackingSupplier":"Andreani","summary":{"total":12.1,"vat":2.1},"items":[{"code":"123","name":"SSD","quantity":2,"price":6.05,"total":12.1}],"date":"22/08/2026","currency":2}`;
    const orders = parseElitPedidosRsc(rsc);
    expect(orders[0]).toMatchObject({
      orderNumber: "9900745926",
      status: "En preparación",
      statusDescription: "Armando",
      pdfUrl: "https://cdn.elit.com.ar/nv/9900745926.pdf",
      dispatchNotePdfUrl: "https://cdn.elit.com.ar/remitos/1.pdf",
      tracking: "AND123",
      trackingSupplier: "Andreani",
    });
    expect(orders[0].items).toEqual([
      expect.objectContaining({ code: "123", name: "SSD", quantity: 2, total: 12.1 }),
    ]);
    expect(orders[0].amount).toBe(12.1);
  });

  it("agrupa un kit ESFABRIC y deja el total del esquema como importe", () => {
    const rsc = `0:{"form":"NOTA DE VENTA","number":"9900748655","date":"02/09/2026","currency":2,"summary":{"net":751.1,"total":865.04},"items":[{"code":"LEXMSD633X64","name":"microSD 64GB","quantity":4,"price":13.44,"total":53.76},{"code":"ESFABRIC_20","name":"PC ELIT ATENEA","quantity":null,"price":0,"net":328.25,"total":328.25,"vat":34.47},{"code":"CMFUEMPX8505AWO","name":"Fuente Cooler Master Elite Gold 850W","quantity":1,"price":0,"total":0},{"code":"AMDPRO5700G8COR","name":"Ryzen 7 5700G","quantity":1,"price":0,"total":0}]}`;
    const order = parseElitPedidosRsc(rsc)[0];
    expect(order.items).toHaveLength(2);
    expect(order.items?.[0]).toMatchObject({ code: "LEXMSD633X64", price: 13.44, total: 53.76 });
    const kit = order.items?.[1];
    expect(kit).toMatchObject({
      code: "ESFABRIC_20",
      name: "PC ELIT ATENEA",
      kit: true,
      price: 0,
      total: 328.25,
    });
    expect(kit?.children).toEqual([
      expect.objectContaining({ code: "CMFUEMPX8505AWO", quantity: 1 }),
      expect.objectContaining({ code: "AMDPRO5700G8COR", quantity: 1 }),
    ]);
  });

  it("mapea informes de pago y opciones sin inventar campos", () => {
    const payments = parseElitPaymentsPayload({
      canCreateReport: true,
      data: { active: null, payments: [{ id: "1000181033", date: "22/08/2026", total: 0, totalApproved: 0, status: "accredited" }] },
    });
    expect(payments.canCreateReport).toBe(true);
    expect(payments.payments[0]).toMatchObject({ id: "1000181033", status: "accredited", total: 0 });
    const options = parseElitPaymentOptions({
      banks: [{ id: 916, name: "BANCO MACRO" }],
      operations: [{ bank: 916, code: 12, name: "TRANSFERENCIA DOLAR BILLETE", validations: { date: true } }],
    });
    expect(options.banks[0]).toEqual({ id: 916, name: "BANCO MACRO" });
    expect(options.operations[0]).toMatchObject({
      bank: 916,
      code: "12",
      name: "TRANSFERENCIA DOLAR BILLETE",
      validations: { date: true },
    });
  });

  it("extrae movimientos de cta cte por invoiceCode", () => {
    const rsc = `1:{"invoiceCode":"A","form":"SALDO","number":"","date":"01/01/2026","debit":null,"credit":null,"total":0,"balance":100,"balanceUSD":50.5,"currency":2}`;
    const { balance, movements } = parseElitCtaRsc(rsc);
    expect(movements).toHaveLength(1);
    expect(movements[0].form).toBe("SALDO");
    expect(balance).toBe(50.5);
  });
});

describe("html-table", () => {
  it("parsea tablas y select de Air/Elit", () => {
    const html = `
      <table>
        <thead><tr><th>Fecha</th><th>Total</th></tr></thead>
        <tr><td>01/01/2026</td><td>12,50</td></tr>
      </table>
      <select id="vendedor"><option value="">SELECCIONE</option><option value="01">PABLO</option></select>
      <p>Saldo de cuenta: $1.234,50</p>
    `;
    const tables = parseHtmlTables(html);
    expect(tables[0].headers).toEqual(["Fecha", "Total"]);
    expect(tables[0].rows[0]).toEqual(["01/01/2026", "12,50"]);
    expect(parseSelectOptions(html, "vendedor").map((o) => o.value)).toEqual(["", "01"]);
    expect(pickBalance(html)).toBe(1234.5);
  });

  it("conserva hrefs de PDF en las celdas", () => {
    const html = `<table><tr><th>Comp</th><th>PDF</th></tr><tr><td>FA 1</td><td><a href="comprobantes.php?pdf=1">Ver</a></td></tr></table>`;
    const tables = parseHtmlTables(html);
    expect(tables[0].rowLinks[0]).toEqual([{ href: "comprobantes.php?pdf=1", label: "Ver" }]);
  });

  it("detecta forms de upload con input file", () => {
    const html = `<form action="adjuntar.php" method="post"><input type="hidden" name="pedido" value="99"/><input type="file" name="comprobante"/></form>`;
    expect(parseFileUploadForms(html)).toEqual([
      { action: "adjuntar.php", method: "post", fileField: "comprobante", fields: { pedido: "99" } },
    ]);
  });
});
