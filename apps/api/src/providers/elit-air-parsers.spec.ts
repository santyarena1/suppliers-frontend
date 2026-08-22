import { elitLoginBody, mapElitCartDetails } from "./elit-web-client";
import { parseElitCtaRsc, parseElitPedidosRsc } from "./elit-rsc.parser";
import { parseHtmlTables, parseSelectOptions, pickBalance } from "./html-table";

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
});
