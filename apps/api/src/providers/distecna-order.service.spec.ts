import { BadRequestException } from "@nestjs/common";
import { DistecnaClient } from "./distecna-client";
import { DistecnaOrderService } from "./distecna-order.service";

const LIVE = {
  name: "O-012-CA-8Z-M12BK/28G/093",
  brand: "Commscope",
  code: "COM760249702",
  sku: "760249702",
  type: "NWOTRO",
  stock: 104368,
  currency: "U$S",
  price: 1.9,
  iva: 0.105,
  ii: 0,
};

function stubClient() {
  return {
    canOrder: true,
    usesV2Catalog: true,
    paymentTerm: jest.fn(async () => ({
      id: "term-1",
      code: "DEP",
      name: "(AR-DEP) 00 Deposito",
    })),
    deliveryAddresses: jest.fn(async () => [
      { id: "addr-1", name: "Irala 1950 2 - Capital Federal", street: "Irala", number: "1950" },
    ]),
    findProductType: jest.fn(async () => "NWOTRO"),
    getDetail: jest.fn(async () => LIVE),
    createOrder: jest.fn(async () => ({
      success: true,
      salesOrderId: "PED-157994-P6X7D1",
      message: "Pedido creado correctamente",
    })),
  };
}

const AUTOR = { userId: "user-1", tenantId: "tenant-1" };
const CREDS = { user: "u", password: "p", api_key: "k" };
const ITEMS = [{ code: "COM760249702", qty: 10, name: "Cable" }];

describe("DistecnaOrderService", () => {
  let api: ReturnType<typeof stubClient>;
  let service: DistecnaOrderService;
  let createOrder: jest.Mock;
  let findOffers: jest.Mock;

  beforeEach(() => {
    api = stubClient();
    jest.spyOn(DistecnaClient, "fromCredentials").mockReturnValue(api as never);
    createOrder = jest.fn(async ({ data }) => ({
      ...data,
      id: "nodo-dt-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    findOffers = jest.fn(async () => [
      {
        externalId: "COM760249702",
        price: 1.82,
        currency: "USD",
        stock: 104499,
        ivaPercent: 10.5,
        product: { name: "Cable Commscope", raw: { code: "COM760249702", type: "NWOTRO", ii: 0 } },
      },
    ]);
    service = new DistecnaOrderService({
      providerOrder: { create: createOrder, findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      tenantProductOffer: { findMany: findOffers },
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("exige usuario y contraseña para pedir (la API Key no alcanza)", async () => {
    await expect(
      service.preview("tenant-1", { api_key: "solo-key" }, { items: ITEMS })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refresca precio just-in-time y marca el cambio contra el catálogo cacheado", async () => {
    const preview = await service.preview("tenant-1", CREDS, { items: ITEMS });
    expect(preview.stockOk).toBe(true);
    expect(preview.hasChanges).toBe(true);
    expect(preview.items[0]).toMatchObject({
      code: "COM760249702",
      type: "NWOTRO",
      qty: 10,
      price: 1.9,
      priceChanged: true,
      ivaPercent: 10.5,
    });
    expect(preview.subtotal).toBe(19);
    expect(preview.vat).toBeCloseTo(1.995, 3);
    expect(preview.total).toBeCloseTo(20.995, 3);
    expect(preview.paymentTermId).toBe("term-1");
    expect(preview.deliveryAddressId).toBe("addr-1");
    expect(api.getDetail).toHaveBeenCalledWith("COM760249702", "NWOTRO");
  });

  it("crea el pedido con productType y no reintenta desde el servicio", async () => {
    const result = await service.submitDraft(AUTOR, CREDS, { items: ITEMS });
    expect(api.createOrder).toHaveBeenCalledTimes(1);
    expect(api.createOrder).toHaveBeenCalledWith({
      products: [{ productCode: "COM760249702", productType: "NWOTRO", quantity: 10 }],
      paymentTermId: "term-1",
      deliveryAddressId: "addr-1",
    });
    expect(result.status).toBe("CREATED");
    expect(result.orderNumber).toBe("PED-157994-P6X7D1");
    expect(createOrder).toHaveBeenCalled();
  });
});
