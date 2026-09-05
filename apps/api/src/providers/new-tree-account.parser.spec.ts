import {
  isInvoiceForm,
  parseAccountBalances,
  parseAccountMovements,
  parsePortalNumber,
  parsePortalOrders,
} from "./new-tree-account.parser";
import { parseCalculate, parseCodeMessage } from "./new-tree-order.service";

const CTA_HTML = `
<script>
$(document).ready(function() {
  var totaldeuven = '10649,81';
  var totaldeuaven = '0,00';
  var totalacreven = '649,81';
  var totalacreaven = '0,00';
  $(".monedasaldototal")[0].innerHTML = 'USD ';
});
</script>
<table class="tablalistadocc table table-striped">
  <tr><th>Fecha de Emisión</th><th>Numero de Comprobante</th><th>Vencimiento de la factura</th><th>Importe Deudor</th><th>Importe Acreedor</th><th>Descargar</th></tr>
  <tr>
    <td><span class="movil">Fecha:</span> 2026-04-28</td>
    <td><span class="movil">Comprobante:</span> Rc A 00001-00182159</td>
    <td><span class="movil">Vencimiento:</span> 2026-04-28</td>
    <td><span class="movil">Imp.Deudor:</span> <small></small></td>
    <td><span class="movil">Imp.Acreedor:</span> <small>ARS </small> 549913.98</td>
    <td><img src="descarga.png" style="cursor:pointer;display:NONE" onclick="abrirPopUp('https://www.newtree.com.ar/')"></td>
  </tr>
  <tr>
    <td><span class="movil">Fecha:</span> 2026-04-27</td>
    <td><span class="movil">Comprobante:</span> Fc A 00011-00095294</td>
    <td><span class="movil">Vencimiento:</span> 2026-04-27</td>
    <td><span class="movil">Imp.Deudor:</span> <small>ARS </small> 549913.98</td>
    <td><span class="movil">Imp.Acreedor:</span> <small></small></td>
    <td><img src="descarga.png" style="cursor:pointer;display:" onclick="abrirPopUp('https://www.newtree.com.ar/wfmPrintMyDocument.aspx?RWpAegNo0oU+ltsp7/MSB2L2b5Lqyp3R==')"></td>
  </tr>
</table>`;

describe("new-tree account parser", () => {
  it("parses portal numbers with dot or comma decimals", () => {
    expect(parsePortalNumber("ARS 549913.98")).toBe(549913.98);
    expect(parsePortalNumber("10649,81")).toBe(10649.81);
    expect(parsePortalNumber("1.234,50")).toBe(1234.5);
    expect(parsePortalNumber("")).toBeNull();
  });

  it("computes balances like the portal script", () => {
    const b = parseAccountBalances(CTA_HTML);
    expect(b).toEqual({ currency: "USD", total: 10000, overdue: 10000, toExpire: 0 });
  });

  it("parses movements with document tokens only when downloadable", () => {
    const rows = parseAccountMovements(CTA_HTML);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: "2026-04-28",
      form: "Rc A",
      number: "00001-00182159",
      credit: 549913.98,
      debit: null,
      currency: "ARS",
      documentToken: null,
    });
    expect(rows[1]).toMatchObject({
      form: "Fc A",
      number: "00011-00095294",
      debit: 549913.98,
      documentToken: "RWpAegNo0oU+ltsp7/MSB2L2b5Lqyp3R==",
    });
    expect(isInvoiceForm(rows[1].form)).toBe(true);
    expect(isInvoiceForm(rows[0].form)).toBe(false);
  });

  it("parses portal orders", () => {
    const html = `<table><tr><th>Id</th><th>Fecha</th><th>Estado</th><th>Origen</th><th>Monto</th><th>Ver</th></tr>
      <tr><td>1234</td><td>2026-05-01</td><td>Pendiente</td><td>Web</td><td>USD 120,50</td><td><a href="/PEDIDO/ID=1234/newtree.aspx">Ver</a></td></tr></table>`;
    expect(parsePortalOrders(html)).toEqual([
      { id: "1234", date: "2026-05-01", status: "Pendiente", origin: "Web", currency: "USD", amount: 120.5, detailUrl: "/PEDIDO/ID=1234/newtree.aspx" },
    ]);
    expect(parsePortalOrders("<table><tr><th>Id</th></tr></table>")).toEqual([]);
  });

  it("parses cart calculation and code/message answers", () => {
    expect(parseCalculate("0;3;145.20;25.20;120.00;0.00;0.00")).toEqual({
      itemCount: 3, total: 145.2, vat: 25.2, subtotal: 120, interest: 0, discount: 0,
    });
    expect(parseCalculate("-1;0;0")).toBeNull();
    expect(parseCodeMessage("106201,Pedido guardado")).toEqual({ code: 106201, message: "Pedido guardado" });
    expect(parseCodeMessage("-1,Sin stock")).toEqual({ code: -1, message: "Sin stock" });
  });
});
