import {
  parseCheckoutForm,
  parseSubmitResult,
  pickPickupDelivery,
  parseOrdersTable,
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
});
