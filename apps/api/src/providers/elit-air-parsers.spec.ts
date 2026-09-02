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
    expect(kit?.vatPercent).toBe(10.5);
  });

  it("anida piezas del esquema con precio de lista y deja el neto del kit para que las líneas cierren", () => {
    const payload = {
      form: "NOTA DE VENTA",
      number: "9900748655",
      date: "02/09/2026",
      currency: 2,
      summary: { net: 751.09, vat: 91.41, perceptions: 22.53, total: 865.04 },
      items: [
        { code: "7078", name: "Transporte OTI", quantity: 1, price: 0, total: 0 },
        { code: "14877", name: "Procesador AMD Ryzen 7 5700G 3.80GHz", quantity: 1, price: 185.56, total: 209.99, iva: 10.5 },
        { code: "15017", name: "Pen Drive KINGSTON DataTraveler 70 64GB", quantity: 2, price: 8.42, total: 18.86, iva: 10.5 },
        { code: "16012", name: "Pen Drive KINGSTON Exodia M 128GB", quantity: 1, price: 13.32, total: 16.52, iva: 21 },
        { code: "16713", name: "Motherboard GIGABYTE A520M K V2 AM4", quantity: 5, price: 40.9, total: 210.02, iva: 10.5 },
        { code: "17778", name: "Tarjeta microSDXC Lexar 633x 64GB", quantity: 4, price: 13.44, total: 55.57, iva: 10.5 },
        { code: "800420", alfaCode: "ESFABRIC_20", name: "PC ELIT ATENEA", quantity: 1, price: 0, total: 0 },
        { code: "18331", name: "Tarjeta microSDXC Lexar 633x 32GB", quantity: 5, price: 9.03, total: 46.37, iva: 10.5 },
        { code: "19104", name: "Pen Drive KINGSTON Exodia M 128GB", quantity: 2, price: 13.95, total: 31.25, iva: 10.5 },
        { code: "19972", name: "Fuente Cooler Master Elite Gold 850W", quantity: 1, price: 73.59, total: 83.27, iva: 10.5 },
        { code: "20351", name: "Pen Drive ADATA UV240 32GB USB 2.0 WHITE", quantity: 3, price: 7.07, total: 22.9, iva: 21 },
        { code: "20352", name: "Pen Drive ADATA UV240 32GB USB 2.0 RED", quantity: 3, price: 7.07, total: 22.9, iva: 21 },
        { code: "20537", name: "Pen Drive BIWIN UD30 16GB USB 2.0", quantity: 3, price: 6.32, total: 20.48, iva: 21 },
        { code: "18215", name: "Fuente GIGABYTE P550S 550W 80 PLUS Silver", quantity: 1, price: 36.99, total: 41.86, iva: 10.5 },
      ],
    };
    const order = parseElitPedidosRsc(`0:${JSON.stringify(payload)}`)[0];
    const kit = order.items?.find((it) => it.kit);
    expect(kit).toMatchObject({
      code: "800420",
      alfaCode: "ESFABRIC_20",
      name: "PC ELIT ATENEA",
      kit: true,
    });
    expect(kit?.net).toBeCloseTo(328.24, 2);
    expect(kit?.children?.map((c) => c.code)).toEqual(["14877", "19972", "18215"]);
    expect(order.items?.some((it) => it.code === "14877")).toBe(false);
    expect(order.items?.find((it) => it.code === "16713")?.quantity).toBe(5);
    const displayedNet = (order.items ?? []).reduce((sum, it) => {
      if (it.kit) return sum + (it.net ?? 0);
      const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
      return sum + Math.round((it.price ?? 0) * q * 100) / 100;
    }, 0);
    expect(displayedNet).toBeCloseTo(751.09, 2);
    expect(kit?.vatPercent).toBe(10.5);
    expect(order.items?.find((it) => it.code === "16012")?.vatPercent).toBe(21);
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
    const { balance, balanceUsd, movements } = parseElitCtaRsc(rsc);
    expect(movements).toHaveLength(1);
    expect(movements[0].form).toBe("SALDO");
    expect(balance).toBe(100);
    expect(balanceUsd).toBe(50.5);
  });

  it("arma cupo, crédito disponible y comprobantes en dólares de la cta cte", () => {
    const payload = {
      creditLimit: 4610000,
      currentAccount: 1187506.7,
      checksInPortfolio: 0,
      pendingOrders: 0,
      availableCredit: 3422493.3,
      status: { label: "Cuenta corriente aprobada", approved: true },
    };
    const factura = {
      invoiceCode: "A",
      form: "FACTURA A",
      number: "0027-00411682",
      date: "31/08/2026",
      dueDate: "31/08/2026",
      remito: "R-8891",
      currency: 2,
      exchangeRate: 1530,
      amount: 773.62,
      debit: 1183638.6,
      credit: null,
      balance: 1187506.7,
      balanceUSD: 773.62,
      status: "Pendiente",
    };
    const recibo = {
      invoiceCode: "A",
      form: "RECIBO A",
      number: "0001-000099",
      date: "01/09/2026",
      currency: 1,
      exchangeRate: 1,
      amount: 5212174.5,
      debit: null,
      credit: 5212174.5,
      balance: 38668.1,
    };
    const rsc = `0:${JSON.stringify(payload)} 1:${JSON.stringify(factura)} 2:${JSON.stringify(recibo)}`;
    const s = parseElitCtaRsc(rsc);
    expect(s.summary).toMatchObject({
      status: "Cuenta corriente aprobada",
      approved: true,
      creditLimit: 4610000,
      currentAccount: 1187506.7,
      checks: 0,
      pendingOrders: 0,
      availableCredit: 3422493.3,
    });
    expect(s.balance).toBe(1187506.7);
    expect(s.usdVouchers).toEqual([
      expect.objectContaining({ number: "0027-00411682", debit: 773.62, dueDate: "31/08/2026" }),
    ]);
    expect(s.movements[0]).toMatchObject({
      form: "FACTURA A",
      remito: "R-8891",
      amount: 773.62,
      exchangeRate: 1530,
      debit: 1183638.6,
      currency: "USD",
    });
    expect(s.movements[1]).toMatchObject({ form: "RECIBO A", credit: 5212174.5, currency: "ARS" });
  });

  it("no toma currency:2 como saldo ni pone pesos en la tabla de dólares", () => {
    const rsc = [
      `Cuenta corriente aprobada`,
      `0:{"invoiceCode":"A","form":"FACTURA A","number":"0027-00411682","date":"2026-08-31T00:00:00.000Z","currency":2,"exchangeRate":1530,"amount":773.62,"debit":1183638.6,"credit":0,"balance":1187506.7,"status":false}`,
      `1:{"invoiceCode":"A","form":"FACTURA A","number":"0027-00410001","date":"2026-08-20T00:00:00.000Z","currency":2,"exchangeRate":1515,"debit":4082437.8,"credit":0,"balance":900000}`,
      `2:{"invoiceCode":"A","form":"RECIBO A","number":"0001-1","date":"2026-08-01T00:00:00.000Z","currency":1,"credit":5212174.5,"debit":null,"balance":38668.1}`,
    ].join(" ");
    const s = parseElitCtaRsc(rsc);
    expect(s.summary.currentAccount).not.toBe(2);
    expect(s.summary.currentAccount).toBe(1187506.7);
    expect(s.movements[0]).toMatchObject({ date: "31/08/2026", amount: 773.62, debit: 1183638.6, pending: true });
    expect(s.usdVouchers).toHaveLength(1);
    expect(s.usdVouchers[0]).toMatchObject({
      number: "0027-00411682",
      debit: 773.62,
      date: "31/08/2026",
      status: "Pendiente",
    });
    expect(s.usdVouchers[0].debit).toBeLessThan(10_000);
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
