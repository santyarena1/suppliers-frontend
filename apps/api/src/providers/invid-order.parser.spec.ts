import {
  parseCheckoutForm,
  parseSubmitResult,
  pickPickupDelivery,
  parseOrdersTable,
  parseAccountStatement,
  computeInvidTotals,
  stripHtmlMessage,
  parseInvidMoney,
  parseQuotedShipping,
  parseXmlCost,
  collectFormFields,
  applyInvidOrderRates,
  parseInvidPaymentForm,
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

  it("toma el Nro. de PEDIDO WEB asignado de mensaje.php", () => {
    const html = `
      <div class="alert alert-success"><h2>Gracias por tu pedido!</h2>
      <b> El pedido fue grabado y enviado a INVID para su procesamiento.</b>
      <b>Nro. de PEDIDO WEB asignado: 207071</b></div>`;
    const result = parseSubmitResult(html);
    expect(result.appearsSuccessful).toBe(true);
    expect(result.webOrderNumber).toBe("207071");
    expect(result.orderNumber).toBeUndefined();
  });

  it("no marca éxito si Invid devolvió de nuevo el carrito", () => {
    const result = parseSubmitResult(CART_HTML);
    expect(result.appearsSuccessful).toBe(false);
    expect(result.errorMessage).toMatch(/sin confirmar/i);
  });

  it("no toma números del carrito aunque mencione pedido web", () => {
    const html = `${CART_HTML}<p>Nro. de PEDIDO WEB asignado: 207070</p>`;
    const result = parseSubmitResult(html);
    expect(result.appearsSuccessful).toBe(false);
    expect(result.webOrderNumber).toBeUndefined();
  });

  it("toma los hidden del form_envio y deja entrega_valida en 0 como el portal", () => {
    const fields = collectFormFields(CART_HTML);
    expect(fields.iniciar_pago).toBe("");
    expect(fields.entrega_valida).toBe("0");
    expect(fields.opcionPago).toBeUndefined();
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

  it("lee ítems, entrega y pago de la fila outline (Ver más)", () => {
    const html = `
      <tr class="CartProduct" id="tr1">
        <td><img onclick="showhide('menu1outline','imgm1','tr1')" /></td>
        <td class="valorizar">203148</td>
        <td class="text-center">Pedido</td>
        <td class="text-center">31-07-2026 13:26:15</td>
        <td class="text-right">US$ 72.07</td>
      </tr>
      <tr id="menu1outline" style="display:none">
        <td colspan="5">
          <table class="tablaped">
            <tr><td></td><td><b>Producto</b></td><td><b>Precio (s/IVA)</b></td><td><b>Cant.</b></td></tr>
            <tr><td></td><td>(0417914) Cargador Kelyx 65W</td><td>US$ 14.89</td><td>4</td></tr>
            <tr><td colspan="4"><a href="ultima.php?n_ped_sel=203148">Cargar a pedido actual</a></td></tr>
          </table>
          <b>Forma de Entrega</b> RETIRA<br>
          <b>Forma de Pago</b> Efectivo
        </td>
      </tr>
    `;
    const order = parseOrdersTable(html).orders[0];
    expect(order).toMatchObject({
      orderNumber: "203148",
      status: "Pedido",
      delivery: "RETIRA",
      payment: "Efectivo",
    });
    expect(order.items[0]).toMatchObject({ code: "0417914", name: expect.stringContaining("Cargador"), qty: "4" });
    expect(order.links.some((l) => l.href.includes("ultima.php"))).toBe(true);
  });

  it("no usa el estado de línea (Abierto) como nombre del producto", () => {
    const html = `
      <tr class="CartProduct" id="tr1">
        <td><img onclick="showhide('menu1outline','imgm1','tr1')" /></td>
        <td class="valorizar">616098</td>
        <td class="valorizar">208021</td>
        <td class="text-center">Abierto</td>
        <td class="text-center">27-08-2026</td>
        <td class="text-right">US$ 213.82</td>
        <td>Adjuntar</td>
      </tr>
      <tr id="menu1outline" style="display:none">
        <td colspan="7">
          <table class="tablaped">
            <tr><td><b>Producto</b></td><td><b>Estado</b></td><td><b>Precio (s/IVA)</b></td><td><b>Cant.</b></td></tr>
            <tr><td><a href="x---det--0418001">(0418001) Cable HDMI 2m</a></td><td>Abierto</td><td>US$ 8.62</td><td>4</td></tr>
            <tr><td>(0418002) Mouse Logitech</td><td>Abierto</td><td>US$ 28.00</td><td>1</td></tr>
            <tr><td>(0418003) Teclado Mecánico</td><td>Abierto</td><td>US$ 19.91</td><td>2</td></tr>
            <tr><td>(0418004) Auriculares BT</td><td>Abierto</td><td>US$ 38.10</td><td>2</td></tr>
            <tr><td>Subtotal</td><td></td><td></td><td>US$ 178.50</td></tr>
            <tr><td>IVA</td><td></td><td></td><td>US$ 35.32</td></tr>
            <tr><td>Total:</td><td></td><td></td><td>US$ 213.82</td></tr>
          </table>
          <b>Forma de Entrega</b> RETIRA<br>
          <b>Forma de Pago</b> Depósito/Transferencia Banco<br>
          Cotización: 1280.50
        </td>
      </tr>
    `;
    const order = parseOrdersTable(html).orders[0];
    expect(order.items).toHaveLength(4);
    expect(order.items.map((it) => it.name)).toEqual([
      expect.stringContaining("Cable HDMI"),
      expect.stringContaining("Mouse Logitech"),
      expect.stringContaining("Teclado"),
      expect.stringContaining("Auriculares"),
    ]);
    expect(order.items.some((it) => /abierto/i.test(it.name))).toBe(false);
    expect(order.items[0]).toMatchObject({ code: "0418001", qty: "4", price: "US$ 8.62", total: "US$ 34.48" });
    expect(order.totals).toMatchObject({ net: 178.5, iva: 35.32, total: 213.82 });
    expect(order.exchangeRate).toBe(1280.5);
    expect(order.delivery).toBe("RETIRA");
  });

  it("separa IVA 10,5 e IVA 21 cuando el HTML los trae discriminados", () => {
    const html = `
      <tr class="CartProduct" id="tr1">
        <td><img onclick="showhide('menu1outline','imgm1','tr1')" /></td>
        <td class="valorizar">616099</td>
        <td class="valorizar">208022</td>
        <td class="text-center">Abierto</td>
        <td class="text-center">02-09-2026</td>
        <td class="text-right">US$ 135.78</td>
        <td>Adjuntar</td>
      </tr>
      <tr id="menu1outline" style="display:none">
        <td colspan="7">
          <table class="tablaped">
            <tr><td><b>Producto</b></td><td><b>Precio (s/IVA)</b></td><td><b>Cant.</b></td></tr>
            <tr><td><a href="x---det--0419001">(0419001) Notebook</a></td><td>US$ 100.00</td><td>1</td></tr>
            <tr><td>Subtotal</td><td></td><td>US$ 100.00</td></tr>
            <tr><td>IVA 10,5%</td><td></td><td>US$ 10.50</td></tr>
            <tr><td>IVA 21%</td><td></td><td>US$ 21.00</td></tr>
            <tr><td>Percepción IIBB</td><td></td><td>US$ 3.00</td></tr>
            <tr><td>Total:</td><td></td><td>US$ 134.50</td></tr>
          </table>
        </td>
      </tr>
    `;
    const order = parseOrdersTable(html).orders[0];
    expect(order.totals).toMatchObject({
      net: 100,
      iva105: 10.5,
      iva21: 21,
      iva: 31.5,
      percepciones: 3,
      total: 134.5,
    });
  });

  it("toma el código del href si la celda no trae el nombre", () => {
    const html = `
      <tr class="CartProduct" id="tr1">
        <td><img onclick="showhide('menu1outline','imgm1','tr1')" /></td>
        <td>616098</td><td>Abierto</td><td>27-08-2026</td><td>US$ 8.62</td>
      </tr>
      <tr id="menu1outline">
        <td>
          <table>
            <tr><td><a href="/x---det--0418123"></a></td><td>Abierto</td><td>US$ 8.62</td><td>1</td></tr>
          </table>
        </td>
      </tr>
    `;
    const item = parseOrdersTable(html).orders[0].items[0];
    expect(item.code).toBe("0418123");
    expect(item.name).toBe("(0418123)");
  });

  it("completa TC actual y pesos cuando el HTML del pedido no trae cotización", () => {
    const html = `
      <tr class="CartProduct" id="tr1">
        <td><img /></td>
        <td>9901</td><td>88421</td><td>Pendiente</td><td>21-08-2026</td><td>US$ 150.00</td><td></td>
      </tr>
    `;
    const [order] = applyInvidOrderRates(parseOrdersTable(html).orders, 1200);
    expect(order.exchangeRate).toBe(1200);
    expect(order.exchangeRateSource).toBe("current");
    expect(order.amountArs).toBe(180000);
  });

  it("no pisa el TC histórico del pedido con el actual", () => {
    const html = `
      <tr class="CartProduct" id="tr1">
        <td><img onclick="showhide('menu1outline','imgm1','tr1')" /></td>
        <td>1</td><td>2</td><td>Abierto</td><td>27-08-2026</td><td>US$ 10.00</td><td></td>
      </tr>
      <tr id="menu1outline"><td>Cotización: 1000</td></tr>
    `;
    const [order] = applyInvidOrderRates(parseOrdersTable(html).orders, 1500);
    expect(order.exchangeRate).toBe(1000);
    expect(order.exchangeRateSource).toBe("order");
    expect(order.amountArs).toBe(10000);
  });

  it("arma impuestos genéricos si Invid no discriminó IVA/IIBB", () => {
    const html = `
      <tr class="CartProduct" id="tr1">
        <td><img onclick="showhide('menu1outline','imgm1','tr1')" /></td>
        <td>1</td><td>Abierto</td><td>27-08-2026</td><td>US$ 213.82</td>
      </tr>
      <tr id="menu1outline">
        <td>
          <table>
            <tr><td>(0418001) Cable HDMI 2m</td><td>US$ 8.62</td><td>4</td></tr>
            <tr><td>(0418002) Mouse Logitech</td><td>US$ 28.00</td><td>1</td></tr>
            <tr><td>(0418003) Teclado Mecánico</td><td>US$ 19.91</td><td>2</td></tr>
            <tr><td>(0418004) Auriculares BT</td><td>US$ 38.10</td><td>2</td></tr>
          </table>
        </td>
      </tr>
    `;
    const order = parseOrdersTable(html).orders[0];
    expect(order.totals?.net).toBe(178.5);
    expect(order.totals?.iva).toBeUndefined();
    expect(order.totals?.taxes).toBe(35.32);
  });

  it("marca Adjuntar en la factura y extrae el popup de comprobantes", () => {
    const html = `
      <tr class="CartProduct" id="tr1">
        <td><img /></td>
        <td>616098</td><td>208021</td><td>Abierto</td><td>27-08-2026</td>
        <td>US$ 213.82</td>
        <td><a href="javascript:void(0)" onclick="window.open('comprobantes_pedido.php?n_ped=616098')">Adjuntar</a></td>
      </tr>
    `;
    const order = parseOrdersTable(html).orders[0];
    expect(order.canAttachPayment).toBe(true);
    expect(order.paymentHref).toBe("comprobantes_pedido.php?n_ped=616098");
    expect(order.invoice).toMatch(/Adjuntar/i);
  });

  it("lee el formulario de Comprobantes de Pago: banco, observaciones y 3 archivos", () => {
    const html = `
      <form action="lista_pedidos_invid.php" method="post" enctype="multipart/form-data">
        <input type="hidden" name="n_ped" value="" />
        <div class="alert">IMPORTANTE: No envíes el comprobante si hay cambios. Echeq: Galicia. Después de las 17:00 hs rige el TC del día siguiente.</div>
        Banco *
        <input type="radio" name="banco" value="Macro" id="b_macro" />
        <label for="b_macro">Macro</label>
        <input type="radio" name="banco" value="Galicia" id="b_galicia" />
        <label for="b_galicia">Galicia</label>
        Observaciones *
        <textarea name="observaciones" required></textarea>
        Adjuntar comprobantes de pago *
        <input type="file" name="archivo1" />
        <input type="file" name="archivo2" />
        <input type="file" name="archivo3" />
        <button type="submit">Enviar</button>
      </form>
    `;
    const form = parseInvidPaymentForm(html);
    expect(form).toMatchObject({
      action: "lista_pedidos_invid.php",
      bankField: "banco",
      notesField: "observaciones",
      orderField: "n_ped",
      fileFields: ["archivo1", "archivo2", "archivo3"],
    });
    expect(form?.banks.map((b) => b.label)).toEqual(["Macro", "Galicia"]);
    expect(form?.notice).toMatch(/17:00/i);
  });

  it("conserva hrefs de la cuenta corriente", () => {
    const html = `
      Saldo de Cuenta Corriente: $-12.50
      <tr class="CartProduct">
        <td class="valorizar">21-08-2026</td>
        <td class="text-center">FAC</td>
        <td class="text-center"><a href="factura.php?n=99">A-99</a></td>
        <td class="text-center">1</td>
        <td class="text-center">USD</td>
        <td class="text-right">12.50</td>
      </tr>
    `;
    const stmt = parseAccountStatement(html);
    expect(stmt.balance).toBe(-12.5);
    expect(stmt.movements[0]).toMatchObject({ docType: "FAC", docNumber: "A-99" });
    expect(stmt.movements[0].hrefs).toEqual(["factura.php?n=99"]);
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
