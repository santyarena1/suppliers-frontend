import { BadRequestException } from "@nestjs/common";
import { AirPortalClient } from "./air-portal-client";
import { AirOrderService, airPerceptionsFromCart } from "./air-order.service";

function cart(over: Record<string, unknown> = {}) {
  return {
    nrocompro: "NV-1",
    sucursal: "SUC06",
    vendedor: "01",
    pago: "01",
    entrega: "01",
    transporte: "",
    texto: "",
    items: [
      {
        codiart: "ABC",
        cantidad: 2,
        precio: 10,
        baseImponible: 10,
        ivaAli: 21,
        ivaNeto: 4.2,
        renglon: 1,
        descart: "Mouse",
        grabado: "1",
      },
    ],
    subtotal: 20,
    total: 24.2,
    iva21: 4.2,
    iva105: 0,
    ii: 0,
    dropEntregaId: "0",
    raw: {},
    ...over,
  };
}

const AUTOR = { userId: "user-1", tenantId: "tenant-1" };

describe("AirOrderService", () => {
  let api: {
    getPedido: jest.Mock;
    addItem: jest.Mock;
    delItem: jest.Mock;
    setPrefer: jest.Mock;
    sendPedido: jest.Mock;
    checkoutOptions: jest.Mock;
  };
  let service: AirOrderService;
  let createOrder: jest.Mock;

  beforeEach(() => {
    const empty = cart({ items: [], nrocompro: "0" });
    const filled = cart();
    api = {
      getPedido: jest.fn(async () => filled),
      addItem: jest.fn(async () => filled),
      delItem: jest.fn(async () => empty),
      setPrefer: jest.fn(async () => undefined),
      sendPedido: jest.fn(async () => ({ ok: true })),
      checkoutOptions: jest.fn(async () => ({
        sucursales: [{ value: "SUC06", label: "Lugano" }],
        vendedores: [{ value: "01", label: "PABLO SENATORE" }],
        pagos: [],
        entregas: [],
        transportes: [],
      })),
    };
    api.getPedido.mockResolvedValueOnce(cart({ items: [{ ...cart().items[0], renglon: 9 }] })).mockResolvedValue(filled);
    jest.spyOn(AirPortalClient, "login").mockResolvedValue(api as never);
    createOrder = jest.fn(async ({ data }) => ({
      ...data,
      id: "nodo-air-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    service = new AirOrderService({
      providerOrder: { create: createOrder, findMany: jest.fn() },
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("arma el canasto NV (add_item por Código) y no usa la API JSON v2", async () => {
    const preview = await service.preview(
      { user: "u", pass: "p" },
      { items: [{ code: "ABC", qty: 2, name: "Mouse" }], sucursal: "SUC06", vendedor: "01", pago: "01", entrega: "01" }
    );
    expect(api.delItem).toHaveBeenCalled();
    expect(api.addItem).toHaveBeenCalledWith("ABC", 2, expect.any(String));
    expect(preview.items[0].code).toBe("ABC");
    expect(preview.note).toMatch(/vendedor/);
    expect(preview.perceptions).toBe(0);
  });

  it("saca la percepción 7% de una NV real (0047-00572620)", () => {
    expect(
      airPerceptionsFromCart({
        subtotal: 1360.57,
        iva21: 142.86,
        iva105: 0,
        ii: 0,
        total: 1598.67,
      })
    ).toBe(95.24);
  });

  it("send_pedido exige vendedor y rechaza dropshipping sin dirección del portal", async () => {
    await expect(
      service.submitDraft(AUTOR, { user: "u", pass: "p" }, {
        items: [{ code: "ABC", qty: 2 }],
        sucursal: "SUC06",
        vendedor: "",
        pago: "01",
        entrega: "01",
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.submitDraft(AUTOR, { user: "u", pass: "p" }, {
        items: [{ code: "ABC", qty: 2 }],
        sucursal: "SUC06",
        vendedor: "01",
        pago: "01",
        entrega: "05",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("envía el canasto al vendedor (send_pedido), no cobra", async () => {
    const result = await service.submitDraft(AUTOR, { user: "u", pass: "p" }, {
      items: [{ code: "ABC", qty: 2, name: "Mouse" }],
      sucursal: "SUC06",
      vendedor: "01",
      pago: "01",
      entrega: "01",
      notes: "retiro jueves",
    });
    expect(api.sendPedido).toHaveBeenCalled();
    expect(api.setPrefer).toHaveBeenCalledWith("vendedor", "01", expect.any(String));
    expect(result.orderNumber).toBe("NV-1");
    expect(result.message).toMatch(/vendedor/);
  });
});
