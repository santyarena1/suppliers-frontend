import axios from "axios";
import { InvidAccountService } from "./invid-account.service";
import { invidPaymentRejection, parseInvidPaymentForm, parseOrdersTable } from "./invid-order.parser";

/** Misma estructura que `lista_pedidos_invid.php` el 4/11/2026, con datos inventados. */
const FORM = `
  <dialog id="portal-comprobante" class="portal-invid-dialogo">
    <form action="lista_pedidos_invid.php" method="post" enctype="multipart/form-data">
      <input type="hidden" name="csrf" value="tok123">
      <input type="hidden" name="accion" value="comprobante">
      <input type="hidden" name="pedido" value="">
      <div class="alert alert-danger">IMPORTANTE: Si hay que realizar cambios en el pedido, no envíes el comprobante aún.</div>
      <fieldset><legend>Banco <span aria-hidden="true">*</span></legend> <label><input type="radio" name="banco" value="M" required=""> Macro</label><br><label><input type="radio" name="banco" value="G"> Galicia</label></fieldset>
      <label for="portal-observaciones">Observaciones <span aria-hidden="true">*</span></label>
      <textarea id="portal-observaciones" name="observaciones" required></textarea>
      <input type="file" name="archivo" accept="image/jpeg,image/png,.pdf" required>
      <input type="file" name="archivo2" accept="image/jpeg,image/png,.pdf">
      <input type="file" name="archivo3" accept="image/jpeg,image/png,.pdf">
      <button type="submit">Enviar</button>
    </form>
  </dialog>`;

const ROW = `
  <tr class="CartProduct">
    <td><button type="button" class="portal-invid-desplegar">+</button></td>
    <td>638649</td><td>217062</td><td>Abierto</td><td>04-11-2026</td><td>USD 100.00</td>
    <td><button type="button" class="btn btn-primary btn-cerrarCaso" data-portal-comprobante="638649">Adjuntar</button></td>
  </tr>`;

const PAGE = `<html><body><table>${ROW}</table>${FORM}</body></html>`;
const CREDS = { username: "u", password: "p" };
const OWNER = { tenantId: "t1", userId: "u1" };

function htmlResponse(html: string, status = 200) {
  return { status, headers: { "content-type": "text/html; charset=utf-8", "set-cookie": ["PHPSESSID=a; path=/"] }, data: Buffer.from(html) };
}

function setup(reply: string) {
  const create = jest.fn().mockResolvedValue({});
  const service = new InvidAccountService({ providerPaymentReceipt: { create } } as never);
  jest.spyOn(axios, "get").mockResolvedValue(htmlResponse(PAGE) as never);
  const post = jest.spyOn(axios, "post").mockImplementation((async (url: string) =>
    /login\.php/.test(url) ? htmlResponse("") : htmlResponse(reply)) as never);
  return { service, create, post };
}

const FILE = { field: "archivo2", filename: "pago.pdf", mimetype: "application/pdf", buffer: Buffer.from("x") };
const EXTRA = { bank: "G", notes: "Pago total", orderNumber: "638649", webOrderNumber: "217062", paymentOrderId: "638649" };

describe("comprobantes de Invid", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lee cada banco con su nombre aunque el botón esté dentro de la etiqueta", () => {
    expect(parseInvidPaymentForm(PAGE)?.banks).toEqual([
      { value: "M", label: "Macro" },
      { value: "G", label: "Galicia" },
    ]);
  });

  it("toma del botón Adjuntar el número que pide el formulario", () => {
    const order = parseOrdersTable(PAGE).orders[0];
    expect(order).toMatchObject({ orderNumber: "638649", webOrderNumber: "217062", canAttachPayment: true, paymentOrderId: "638649" });
  });

  it("manda solo los campos del formulario y deja registrado el comprobante", async () => {
    const { service, create, post } = setup(PAGE);
    const res = await service.attachPayment(OWNER, CREDS, [FILE], EXTRA);

    const body = post.mock.calls[1][1] as FormData;
    expect(post.mock.calls[1][0]).toBe("https://www.invidcomputers.com/lista_pedidos_invid.php");
    expect(body.get("csrf")).toBe("tok123");
    expect(body.get("accion")).toBe("comprobante");
    expect(body.get("pedido")).toBe("638649");
    expect(body.get("banco")).toBe("G");
    expect(body.get("observaciones")).toBe("Pago total");
    // Elegido en el segundo selector: tiene que ir en el campo obligatorio.
    expect(body.get("archivo")).toBeInstanceOf(Blob);
    expect(body.get("archivo2")).toBeNull();
    expect(body.get("bank")).toBeNull();
    expect(body.get("orderNumber")).toBeNull();

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "t1", provider: "INVID", orderNumber: "638649", bank: "G", createdByUserId: "u1" }),
    });
    expect(res).toMatchObject({ ok: true, sentAt: expect.any(String) });
  });

  it("si Invid lo rechaza avisa el motivo y no lo marca como cargado", async () => {
    const reply = `<html><body><div class="alert alert-danger">El archivo supera el tamaño permitido</div><table>${ROW}</table>${FORM}</body></html>`;
    const { service, create } = setup(reply);
    await expect(service.attachPayment(OWNER, CREDS, [FILE], EXTRA)).rejects.toThrow("El archivo supera el tamaño permitido");
    expect(create).not.toHaveBeenCalled();
  });

  it("si Invid responde 400 no lo marca como cargado", async () => {
    const create = jest.fn();
    const service = new InvidAccountService({ providerPaymentReceipt: { create } } as never);
    jest.spyOn(axios, "get").mockResolvedValue(htmlResponse(PAGE) as never);
    jest.spyOn(axios, "post").mockImplementation((async (url: string) =>
      /login\.php/.test(url) ? htmlResponse("") : htmlResponse("nope", 400)) as never);
    await expect(service.attachPayment(OWNER, CREDS, [FILE], EXTRA)).rejects.toThrow("(400)");
    expect(create).not.toHaveBeenCalled();
  });

  it("detecta rechazos sin confundirlos con el aviso fijo del formulario", () => {
    expect(invidPaymentRejection(PAGE, PAGE)).toBeNull();
    expect(invidPaymentRejection(`{"exito":false,"mensaje":"Pedido inválido"}`, PAGE)).toBe("Pedido inválido");
    expect(invidPaymentRejection(`<form><input name="passwd"></form>`, PAGE)).toMatch(/sesión/);
    expect(invidPaymentRejection("Token inválido", PAGE)).toBe("Token inválido");
  });

  it("suma a cada pedido cuándo se cargó su comprobante", async () => {
    const at = new Date("2026-11-04T20:00:00.000Z");
    const findMany = jest.fn().mockResolvedValue([{ orderNumber: "638649", createdAt: at }]);
    const service = new InvidAccountService({ providerPaymentReceipt: { findMany } } as never);
    const res = await service.withPaymentReceipts("t1", { orders: [{ orderNumber: "638649" }, { orderNumber: "1" }] });
    expect(res.orders).toEqual([
      { orderNumber: "638649", paymentSentAt: at.toISOString() },
      { orderNumber: "1", paymentSentAt: undefined },
    ]);
  });
});
