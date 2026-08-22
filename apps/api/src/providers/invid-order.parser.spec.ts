import {
  parseCheckoutForm,
  parseSubmitResult,
  pickPickupDelivery,
  parseOrdersTable,
  computeInvidTotals,
  stripHtmlMessage,
  parseInvidMoney,
  parseQuotedShipping,
  parseXmlCost,
} from "./invid-order.parser";

const CART_HTML = `
<form method="post" name="form_envio" id="form_envio" action="carrito.php">
  <input type="hidden" name="iniciar_pago" id="iniciar_pago" value="">
  <input type="hidden" name="entrega_valida" id="entrega_valida" value="0">
  <input type="radio" name="opcionPago" id="pago_contado" value="-1">
  <label for="pago_contado">Contado</label>
  <input type="radio" name="opcionPago" value="67" id="pago_dep">
  <label for="pago_dep">Dep&oacute;sito/Transferencia Banco</label>
  <input type="radio" name="entrega" id="opcion_1" value="1">
  <label for="opcion_1">Retiro en f&aacute;brica</label>
  <input type="radio" name="entrega" id="opcion_5" value="5">
  <label for="opcion_5">Entregar</label>
  <input type="checkbox" name="termYCond" id="termYCond">
  <button type="button" id="iniciarpago">CONFIRMAR PEDIDO</button>
</form>
`;

describe("invid-order.parser", () => {
  it("extrae formas de pago y entrega del carrito autenticado", () => {
    const form = parseCheckoutForm(CART_HTML);
    expect(form.hasConfirmButton).toBe(true);
    expect(form.hasTerms).toBe(true);
    expect(form.payments.map((p) => p.value)).toEqual(["-1", "67"]);
    expect(form.payments[1].label).toMatch(/Depósito\/Transferencia/i);
    expect(form.deliveries).toHaveLength(2);
    expect(form.expresoCompanies).toEqual([]);
    expect(pickPickupDelivery(form.deliveries)?.value).toBe("1");
  });

  it("detecta un pedido creado en la página de confirmación", () => {
    const html = `<h1>Gracias</h1><p>Número de pedido web: 88421</p><p>Orden: 12033</p>`;
    const result = parseSubmitResult(html);
    expect(result.appearsSuccessful).toBe(true);
    expect(result.webOrderNumber).toBe("88421");
    expect(result.orderNumber).toBe("12033");
  });

  it("no marca éxito si Invid devolvió de nuevo el carrito", () => {
    const result = parseSubmitResult(CART_HTML);
    expect(result.appearsSuccessful).toBe(false);
    expect(result.errorMessage).toMatch(/sin confirmar/i);
  });

  it("lee el historial de pedidos del portal", () => {
    const html = `
      <tr class="CartProduct" id="tr1"><td><img/></td>
      <td class="valorizar"> 9901 </td>
      <td class="valorizar"> 88421 </td>
      <td class="text-center"> Pendiente </td>
      <td class="text-center">21-08-2026</td>
      <td align="right" class="text-right">US$ 150.00</td>
      <td> </td></tr>
    `;
    expect(parseOrdersTable(html).orders[0]).toMatchObject({
      orderNumber: "9901",
      webOrderNumber: "88421",
      status: "Pendiente",
    });
  });

  it("elige RETIRA como forma de entrega del borrador", () => {
    const html = `
      <input type="radio" name="entrega" value="6" id="opcion_entregar"/>
      <label for="opcion_entregar">Entrega Express 24hs (AMBA)</label>
      <input type="radio" name="entrega" value="1" id="opcion_1"/>
      <label for="opcion_1">RETIRA</label>
    `;
    const form = parseCheckoutForm(html);
    expect(pickPickupDelivery(form.deliveries)?.value).toBe("1");
    expect(pickPickupDelivery(form.deliveries)?.label).toMatch(/RETIRA/i);
  });

  it("suma el resumen de Invid igual que el portal: neto + IVA + percepción %", () => {
    const totals = computeInvidTotals({
      net: 14.89,
      ivaProducts: 3.13,
      internos: 0,
      percepcionPercent: 3,
      shipping: 0,
    });
    expect(totals.iva).toBe(3.13);
    expect(totals.percepciones).toBe(0.45);
    expect(totals.total).toBe(18.47);
  });

  it("incluye IVA y percepción del envío puerta a puerta", () => {
    const totals = computeInvidTotals({
      net: 14.89,
      ivaProducts: 3.13,
      internos: 0,
      percepcionPercent: 3,
      shipping: 6.01,
    });
    expect(totals.shipping).toBe(6.01);
    expect(totals.iva).toBe(4.39);
    expect(totals.percepciones).toBe(0.63);
    expect(totals.total).toBe(25.92);
  });

  it("deja el mensaje de stock de Invid sin HTML", () => {
    expect(stripHtmlMessage('<span class="stockok">Se han validado los stocks de los productos</span>'))
      .toBe("Se han validado los stocks de los productos");
    expect(stripHtmlMessage("Sin stock: <b>0417517</b><br/>Producto agotado"))
      .toBe("Sin stock: 0417517\nProducto agotado");
  });

  it("lee las empresas de expreso del select real", () => {
    const html = `
      <select name="expreso_entrega" id="expreso_entrega">
        <option value="">Seleccione el Expreso</option>
        <option value="1">ACERCAR</option>
        <option value="214">ACI CARGAS</option>
      </select>
    `;
    const form = parseCheckoutForm(html);
    expect(form.expresoCompanies).toEqual([
      { value: "1", label: "ACERCAR" },
      { value: "214", label: "ACI CARGAS" },
    ]);
  });

  it("parsea montos de Invid en USD, XML y HTML de entrega", () => {
    expect(parseInvidMoney("US$ 6.01")).toBe(6.01);
    expect(parseInvidMoney("6,50")).toBe(6.5);
    expect(parseXmlCost("<root><costo>0.00</costo></root>")).toBe(0);
    const html = `
      <span id="valor_envio_x_cp">6.01</span>
      <span id="valorEntregar">12.40</span>
      <span id="valorExpreso">0.00</span>
      <tr id="fila_1"><td></td><td>RETIRA</td><td>US$ 0.00</td></tr>
    `;
    expect(parseQuotedShipping(html, "5")).toBe(6.01);
    expect(parseQuotedShipping(html, "6")).toBe(12.4);
    expect(parseQuotedShipping(html, "3")).toBe(0);
    expect(parseQuotedShipping(html, "1")).toBe(0);
  });
});
