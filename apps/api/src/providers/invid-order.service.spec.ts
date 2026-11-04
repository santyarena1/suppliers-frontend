import axios from "axios";
import { BadRequestException } from "@nestjs/common";
import { InvidOrderService, parseSelectAddresses } from "./invid-order.service";
import { parseInvidCheckoutPage } from "./invid-checkout.parser";

/**
 * Portal de Invid falso con el checkout de noviembre 2026: `carrito.php`
 * arma la página con `data-csrf` y las acciones van por POST con JSON.
 */
function fakePortal(stock: Record<string, number> = {}) {
  let cart: { code: string; qty: number }[] = [];
  const calls: string[] = [];
  const CSRF = "tok123";

  const page = () => `<html><body>
<section class="checkout-invid" data-checkout-invid data-entrega-cotizada="" data-csrf="${CSRF}" data-moneda="US$" data-clave="" data-vence="0">
${cart.length === 0 ? "<p>Tu carrito está vacío</p>" : `<form id="checkout-formulario">
<input type="hidden" name="direccion" id="checkout-direccion" value="7545">
<label for="checkout-direccion-7543"><input type="radio" name="direccion_opcion" id="checkout-direccion-7543" value="7543" data-provincia="AR-C" data-descripcion="Local Calle 1 - CABA (1440)" data-domicilio="Calle 1 - CABA - 1440 - CABA" data-cp="1440" data-localidad="CABA" data-provincia-nombre="CABA"> <strong>Local</strong> Calle 1 - CABA (1440)</label>
<label for="checkout-direccion-7545"><input type="radio" name="direccion_opcion" id="checkout-direccion-7545" value="7545" checked="" data-provincia="AR-C" data-descripcion="Depósito Calle 373 - CABA (1408)" data-domicilio="Calle 373 - CABA - 1408 - CABA" data-cp="1408" data-localidad="CABA" data-provincia-nombre="CABA"> <strong>Depósito</strong> Calle 373 - CABA (1408)</label>
<table>${cart.map((l, i) => `<tr data-indice="${i + 1}"><td class="checkout-nombre"><strong>Producto ${l.code}</strong><small>(Cód. ${l.code})</small></td><td><input type="number" min="1" max="999999" step="1" value="${l.qty}"></td></tr>`).join("")}</table>
<tr><td><input type="radio" name="entrega" id="checkout-entrega-6" value="6" data-expreso="N" required=""></td><td><label for="checkout-entrega-6">Entrega Express 24hs (AMBA)</label></td></tr>
<tr><td><input type="radio" name="entrega" id="checkout-entrega-3" value="3" data-expreso="S"></td><td><label for="checkout-entrega-3">EXPRESO costo adicional contra entrega (interior del país)</label><select name="expreso"><option value="">Seleccioná un expreso</option><option value="1">ACERCAR</option></select></td></tr>
<tr><td><input type="radio" name="entrega" id="checkout-entrega-5" value="5" data-expreso="N"></td><td><label for="checkout-entrega-5">Puerta a Puerta</label></td></tr>
<tr><td><input type="radio" name="entrega" id="checkout-entrega-1" value="1" checked="" data-expreso="N"></td><td><label for="checkout-entrega-1">RETIRA</label></td></tr>
<div class="checkout-opcion-pago"><input type="radio" name="pago" id="checkout-pago--1" value="-1"><label for="checkout-pago--1"><strong>Contado</strong><span>Sin recargo</span></label></div>
<div class="checkout-opcion-pago"><input type="radio" name="pago" id="checkout-pago-67" value="67" checked=""><label for="checkout-pago-67"><strong>Depósito/Transferencia Banco</strong><span>Sin recargo</span></label></div>
<div class="checkout-opcion-pago"><input type="radio" name="pago" id="checkout-pago-132" value="132"><label for="checkout-pago-132"><strong>Tarjeta de Crédito</strong><span>Recargo del 5,00%</span></label></div>
</form>`}
</section></body></html>`;

  const json = (data: unknown) => ({ status: 200, headers: { "content-type": "application/json" }, data: Buffer.from(JSON.stringify(data)) });
  const html = (s: string) => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, data: Buffer.from(s) });

  const quote = (envio: number) => {
    const items = cart.map((l, i) => {
      const iva = l.code === "0418533" ? 10.5 : 21;
      const subtotal = 100 * l.qty;
      const internos = l.code === "0418738" ? subtotal * 0.105 : 0;
      return {
        indice: i + 1, articulo: l.code, cantidad: l.qty, nombre: `Producto ${l.code}`, precio: 100, iva,
        stock: stock[l.code] ?? 50, subtotal, iva_importe: subtotal * (iva / 100), impuesto_interno_importe: internos,
        total: subtotal * (1 + iva / 100) + internos,
      };
    });
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const iva = items.reduce((s, i) => s + i.iva_importe, 0) + envio * 0.21;
    const internos = items.reduce((s, i) => s + i.impuesto_interno_importe, 0);
    const percepciones = (subtotal + envio) * 0.03;
    return {
      clave: "clave-1", vence: Math.floor(Date.now() / 1000) + 600, moneda_iso: "USD", porcentaje_percepcion: 3,
      stocks_validacion: Object.fromEntries(items.map((i) => [i.articulo, i.stock])),
      tipo_cambio: { cambio: 1570 }, items,
      totales: { subtotal, iva, impuestos_internos: internos, envio, percepciones, recargo: 0, total: subtotal + iva + internos + envio + percepciones },
    };
  };

  jest.spyOn(axios, "post").mockImplementation((async () => ({ status: 302, headers: { "set-cookie": ["PHPSESSID=abc; path=/"], location: "home_usuario.php" }, data: "" })) as never);
  jest.spyOn(axios, "request").mockImplementation((async (config: { method?: string; url?: string; params?: Record<string, string | number>; data?: string }) => {
    const url = config.url ?? "";
    if (url.endsWith("/servicios.php") && config.params?.servicio === "sumar_a_carrito") {
      const code = String(config.params.producto);
      const qty = Number(config.params.cantidad);
      calls.push(`sumar ${code}x${qty}`);
      if (code === "999") return html(`<?xml version="1.0"?><respuesta><error>El producto no existe</error></respuesta>`);
      const prev = cart.find((l) => l.code === code);
      if (prev) prev.qty += qty;
      else cart.push({ code, qty });
      return html(`<?xml version="1.0"?><respuesta><precio>100</precio><moneda>1</moneda><monto>1</monto><cantidad>1</cantidad><imagen>x</imagen><nombre>Producto ${code}</nombre><decimales>2</decimales></respuesta>`);
    }
    if (url.endsWith("/carrito.php") && config.method === "POST") {
      const body = new URLSearchParams(config.data ?? "");
      const accion = body.get("accion_invid");
      calls.push(accion ?? "?");
      if (body.get("csrf") !== CSRF) return json({ exito: false, mensaje: "Token inválido" });
      if (accion === "eliminar") {
        const idx = Number(body.get("indice")) - 1;
        cart.splice(idx, 1);
        return json({ exito: true, carrito: { items: cart.map((l, i) => ({ indice: i + 1, cantidad: l.qty, articulo: l.code })), totales: {}, cantidad_carrito: cart.length } });
      }
      if (accion === "cotizar_entrega") return json({ exito: true, cotizacion: { costo: 17575.84, moneda_iso: "ARS" } });
      if (accion === "cotizar_envio_cp") return json({ exito: true, cotizacion: { costo: 6.01, moneda_iso: "USD" } });
      if (accion === "cotizar") {
        if (!body.get("direccion")) return json({ exito: false, mensaje: "Seleccioná una dirección" });
        if (body.get("entrega") === "3" && !body.get("expreso")) return json({ exito: false, mensaje: "Seleccioná una expreso disponible para tu empresa." });
        const envio = body.get("entrega") === "6" ? 11.19 : body.get("entrega") === "5" ? 6.01 : 0;
        return json({ exito: true, cotizacion: quote(envio) });
      }
      if (accion === "confirmar") {
        if (body.get("clave") !== "clave-1") return json({ exito: false, mensaje: "La cotización venció" });
        cart = [];
        return json({ exito: true, pedido: 219001, pago: {} });
      }
      return json({ exito: false, mensaje: "Acción desconocida" });
    }
    if (url.endsWith("/carrito.php")) return html(page());
    if (url.endsWith("/select_direcciones.php")) {
      return html(`<ul><li> <input type="radio" name="dir_selected" id="dir_selected_7545" value="7545"> <b>Depósito</b><br>Calle 373 - CABA (1408)<br>CABA - </li></ul>`);
    }
    if (url.endsWith("/lista_pedidos_invid.php")) return html("<table></table>");
    return html("");
  }) as never);

  return { calls, cart: () => cart, setCart: (c: { code: string; qty: number }[]) => (cart = c) };
}

const CREDS = { username: "u", password: "p" };
const AUTOR = { userId: "user-1", tenantId: "tenant-1" };

function makeService() {
  const create = jest.fn(async ({ data }) => ({ ...data, id: "o1", createdAt: new Date(), updatedAt: new Date() }));
  const service = new InvidOrderService(
    {
      providerOrder: { create, update: jest.fn(async ({ data }) => ({ ...data, id: "o1" })), findMany: jest.fn() },
      tenantProductOffer: { findMany: jest.fn(async () => []) },
    } as never,
    { load: jest.fn(async () => null), save: jest.fn(async () => undefined), clear: jest.fn(async () => undefined) } as never
  );
  return { service, create };
}

describe("Invid: checkout nuevo (carrito.php con acciones JSON)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lee csrf, filas, direcciones, entregas, expresos y pagos de la página", () => {
    const portal = fakePortal();
    portal.setCart([{ code: "0418533", qty: 2 }]);
    let html = "";
    // Se usa la misma página que sirve el portal falso.
    return axios.request({ method: "GET", url: "https://www.invidcomputers.com/carrito.php" }).then((res) => {
      html = Buffer.from(res.data as Buffer).toString();
      const page = parseInvidCheckoutPage(html);
      expect(page.csrf).toBe("tok123");
      expect(page.rows).toEqual([{ index: 1, code: "0418533", qty: 2, name: "Producto 0418533" }]);
      expect(page.addresses.map((a) => [a.id, a.label, a.cp, a.isDefault])).toEqual([
        ["7543", "Local", "1440", false],
        ["7545", "Depósito", "1408", true],
      ]);
      expect(page.deliveries.map((d) => d.value)).toEqual(["6", "3", "5", "1"]);
      expect(page.expresoCompanies).toEqual([{ value: "1", label: "ACERCAR" }]);
      expect(page.payments.map((p) => [p.value, p.label])).toEqual([["-1", "Contado"], ["67", "Depósito/Transferencia Banco"], ["132", "Tarjeta de Crédito"]]);
    });
  });

  it("cotiza: vacía lo que había, carga lo de NODO y toma IVA, internos y percepciones de Invid", async () => {
    const portal = fakePortal();
    portal.setCart([{ code: "111", qty: 5 }]);
    const { service } = makeService();
    const preview = await service.preview(CREDS, {
      items: [{ code: "0418533", qty: 1 }, { code: "0418738", qty: 2 }],
      addressId: "7545",
      paymentOption: "67",
    });
    expect(preview.stockOk).toBe(true);
    expect(preview.items.map((i) => [i.code, i.qty, i.iva, i.internos])).toEqual([
      ["0418533", 1, 10.5, 0],
      ["0418738", 2, 42, 21],
    ]);
    expect(preview.subtotal).toBe(300);
    expect(preview.percepcionPercent).toBe(3);
    expect(preview.suggestedDelivery.value).toBe("1");
    // Lo que había antes en el portal no entra y la sesión queda vacía.
    expect(portal.calls.filter((c) => c.startsWith("sumar"))).toEqual(["sumar 0418533x1", "sumar 0418738x2"]);
    expect(portal.cart()).toEqual([]);
  });

  it("Express 24 hs se cotiza antes y el envío viene en dólares dentro del total", async () => {
    const portal = fakePortal();
    const { service } = makeService();
    const preview = await service.preview(CREDS, { items: [{ code: "0418533", qty: 1 }], addressId: "7545", paymentOption: "67", deliveryOption: "6" });
    expect(portal.calls).toContain("cotizar_entrega");
    expect(preview.shippingCost).toBe(11.19);
  });

  it("avisa cuánto stock tiene Invid si pedís más", async () => {
    fakePortal({ "0413863": 1 });
    const { service } = makeService();
    const preview = await service.preview(CREDS, { items: [{ code: "0413863", qty: 3, name: "Auricular" }], addressId: "7545", paymentOption: "67" });
    expect(preview.stockOk).toBe(false);
    expect(preview.stockMessage).toContain("Auricular: pediste 3, hay 1");
  });

  it("un código que Invid rechaza queda como error del producto", async () => {
    fakePortal();
    const { service } = makeService();
    const preview = await service.preview(CREDS, { items: [{ code: "999", qty: 1 }], addressId: "7545", paymentOption: "67" });
    expect(preview.itemErrors).toEqual([{ code: "999", name: undefined, message: "El producto no existe" }]);
    expect(preview.stockOk).toBe(false);
  });

  it("una dirección que no es de la cuenta no se cotiza", async () => {
    fakePortal();
    const { service } = makeService();
    await expect(service.preview(CREDS, { items: [{ code: "0418533", qty: 1 }], addressId: "1", paymentOption: "67" })).rejects.toThrow(
      "Esa dirección no está en tu cuenta de Invid"
    );
  });

  it("confirma con la clave de la cotización y guarda el número de pedido web", async () => {
    const portal = fakePortal();
    const { service, create } = makeService();
    const result = await service.submitDraft(AUTOR, CREDS, { items: [{ code: "0418533", qty: 1 }], addressId: "7545", paymentOption: "67" });
    expect(portal.calls.slice(-2)).toEqual(["cotizar", "confirmar"]);
    expect(result.webOrderNumber).toBe("219001");
    expect(create.mock.calls[0][0].data).toMatchObject({ status: "CREATED", invidWebOrderNumber: "219001", deliveryOption: "1" });
  });

  it("si Invid acepta pero no da número, avisa que no se reintente", async () => {
    fakePortal();
    const real = (axios.request as unknown as jest.Mock).getMockImplementation();
    jest.spyOn(axios, "request").mockImplementation((async (config: { method?: string; url?: string; data?: string }) => {
      if (config.method === "POST" && new URLSearchParams(config.data ?? "").get("accion_invid") === "confirmar") {
        return { status: 200, headers: { "content-type": "application/json" }, data: Buffer.from(JSON.stringify({ exito: true })) };
      }
      return (real as never as (c: unknown) => Promise<unknown>)(config);
    }) as never);
    const { service } = makeService();
    await expect(service.submitDraft(AUTOR, CREDS, { items: [{ code: "0418533", qty: 1 }], addressId: "7545", paymentOption: "67" })).rejects.toThrow("no duplicarlo");
  });

  it("sin stock no confirma", async () => {
    const portal = fakePortal({ "0418533": 0 });
    const { service } = makeService();
    await expect(service.submitDraft(AUTOR, CREDS, { items: [{ code: "0418533", qty: 1 }], addressId: "7545", paymentOption: "67" })).rejects.toThrow(BadRequestException);
    expect(portal.calls).not.toContain("confirmar");
  });

  it("EXPRESO sin empresa no se manda", async () => {
    fakePortal();
    const { service } = makeService();
    await expect(
      service.submitDraft(AUTOR, CREDS, { items: [{ code: "0418533", qty: 1 }], addressId: "7545", paymentOption: "67", deliveryOption: "3" })
    ).rejects.toThrow("Para EXPRESO tenés que elegir la empresa de transporte");
  });

  it("direcciones de select_direcciones.php con el formato nuevo", () => {
    const html = `<ul><li> <input type="radio" name="dir_selected" id="dir_selected_7545" value="7545"> <b>Depósito</b><br>Calle 373 - CABA (1408)<br>CABA - </li>
<li> <input type="radio" name="dir_selected" id="dir_selected_7543" value="7543"> <b>Local</b><br>Calle 1 - CABA (1440)<br>CABA - </li></ul>`;
    expect(parseSelectAddresses(html)).toEqual([
      { id: "7545", label: "Depósito", addressLine: "Calle 373 - CABA (1408)", isDefault: false },
      { id: "7543", label: "Local", addressLine: "Calle 1 - CABA (1440)", isDefault: false },
    ]);
  });
});

describe("Invid: Mis pedidos con el listado de noviembre 2026", () => {
  it("salta el botón «+» de la primera columna y lee el detalle desplegable", () => {
    const { parseOrdersTable } = jest.requireActual("./invid-order.parser") as typeof import("./invid-order.parser");
    const html = `<table id="tabla_carrito"><thead><tr><th></th><th>Nº Orden de Venta</th><th>Nº Pedido Web</th><th>Estado</th><th>Fecha de Pedido</th><th>Importe final a abonar</th><th>Comprobante</th></tr></thead>
<tr class="CartProduct" id="portal-fila-0"> <td><button type="button" class="portal-invid-desplegar" data-portal-detalle="" aria-expanded="false" aria-controls="portal-pedido-0"><span aria-hidden="true">+</span></button></td> <td class="valorizar">637584</td> <td class="valorizar">218791</td> <td class="text-center">Cerrado</td> <td class="text-center">02-11-2026</td> <td align="right" class="text-right">USD 1286.07</td> <td>-</td> </tr>
<tr id="portal-pedido-0"><td><table class="cartTable table-responsive"><tr><td></td><td><table class="tablaped"><tr><td>Producto</td><td>Estado</td><td>Cant.</td><td>Precio (s/IVA)</td><td>SubTotal</td></tr>
<tr><td>0415038 Mouse Pad Razer Pro Glide</td><td>Cerrado</td><td>3</td><td>USD 10.58</td><td>USD 31.74</td></tr></table></td></tr></table></td></tr>
<tr class="CartProduct" id="portal-fila-1"> <td><button type="button" class="portal-invid-desplegar"><span>+</span></button></td> <td class="valorizar">635865</td> <td class="valorizar">218008</td> <td class="text-center">Pendiente</td> <td class="text-center">28-10-2026</td> <td class="text-right">USD 50.00</td> <td>-</td> </tr>
</table>`;
    const { orders } = parseOrdersTable(html);
    expect(orders.map((o) => [o.orderNumber, o.webOrderNumber, o.status, o.date])).toEqual([
      ["637584", "218791", "Cerrado", "02-11-2026"],
      ["635865", "218008", "Pendiente", "28-10-2026"],
    ]);
    expect(orders[0].items.length).toBeGreaterThan(0);
  });
});
