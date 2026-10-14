import {
  finalFromNet,
  isStockFresh,
  linesOverStock,
  shouldWarnStale,
  stockAfterOrder,
  stockExpiresAt,
  storefrontHiddenReason,
  storefrontSupplierName,
} from "./storefront-rules";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-14T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("vigencia del stock de una tienda", () => {
  it("sin confirmar nunca, no está vigente ni vence", () => {
    expect(stockExpiresAt({ stockConfirmedAt: null, stockValidDays: 3 })).toBeNull();
    expect(isStockFresh({ stockConfirmedAt: null, stockValidDays: 3 }, now)).toBe(false);
  });

  it("vale los días configurados y vence justo al cumplirse", () => {
    expect(isStockFresh({ stockConfirmedAt: ago(2 * DAY), stockValidDays: 3 }, now)).toBe(true);
    expect(isStockFresh({ stockConfirmedAt: ago(3 * DAY), stockValidDays: 3 }, now)).toBe(false);
    expect(isStockFresh({ stockConfirmedAt: ago(3 * DAY - 1000), stockValidDays: 3 }, now)).toBe(true);
  });

  it("días inválidos caen en 3", () => {
    expect(stockExpiresAt({ stockConfirmedAt: now, stockValidDays: 0 })?.getTime()).toBe(now.getTime() + 3 * DAY);
  });
});

describe("por qué una tienda no se ve", () => {
  const base = { status: "ACTIVE" as const, stockConfirmedAt: ago(DAY), stockValidDays: 3, ownerActive: true };

  it("activa, con stock vigente y comercio activo: se ve", () => {
    expect(storefrontHiddenReason(base, now)).toBeNull();
  });

  it("orden de motivos: comercio inactivo, frenada, pausada, sin confirmar, vencida", () => {
    expect(storefrontHiddenReason({ ...base, ownerActive: false, status: "SUSPENDED" }, now)).toBe("OWNER_INACTIVE");
    expect(storefrontHiddenReason({ ...base, status: "SUSPENDED" }, now)).toBe("SUSPENDED");
    expect(storefrontHiddenReason({ ...base, status: "PAUSED" }, now)).toBe("PAUSED");
    expect(storefrontHiddenReason({ ...base, stockConfirmedAt: null }, now)).toBe("NO_STOCK_CONFIRMED");
    expect(storefrontHiddenReason({ ...base, stockConfirmedAt: ago(4 * DAY) }, now)).toBe("STOCK_EXPIRED");
  });
});

describe("aviso de stock por vencer", () => {
  const base = { status: "ACTIVE" as const, stockValidDays: 3, staleWarnedAt: null };

  it("avisa cuando falta menos de un día", () => {
    expect(shouldWarnStale({ ...base, stockConfirmedAt: ago(2.5 * DAY) }, now)).toBe(true);
    expect(shouldWarnStale({ ...base, stockConfirmedAt: ago(1 * DAY) }, now)).toBe(false);
  });

  it("también avisa si ya venció y no se avisó", () => {
    expect(shouldWarnStale({ ...base, stockConfirmedAt: ago(10 * DAY) }, now)).toBe(true);
  });

  it("no repite el aviso hasta que se vuelva a confirmar", () => {
    const confirmed = ago(2.5 * DAY);
    expect(shouldWarnStale({ ...base, stockConfirmedAt: confirmed, staleWarnedAt: ago(DAY) }, now)).toBe(false);
    // Avisado antes de la última confirmación: es un vencimiento nuevo.
    expect(shouldWarnStale({ ...base, stockConfirmedAt: confirmed, staleWarnedAt: ago(5 * DAY) }, now)).toBe(true);
  });

  it("nada que avisar si está pausada o nunca confirmó", () => {
    expect(shouldWarnStale({ ...base, status: "PAUSED", stockConfirmedAt: ago(10 * DAY) }, now)).toBe(false);
    expect(shouldWarnStale({ ...base, stockConfirmedAt: null }, now)).toBe(false);
  });
});

describe("stock al confirmar un pedido", () => {
  const current = new Map<string, number | null>([
    ["A", 5],
    ["B", 1],
    ["C", null],
  ]);

  it("descuenta, suma líneas repetidas y nunca baja de 0", () => {
    const next = stockAfterOrder(current, [
      { externalId: "A", qty: 2 },
      { externalId: "A", qty: 1 },
      { externalId: "B", qty: 3 },
    ]);
    expect(next.get("A")).toBe(2);
    expect(next.get("B")).toBe(0);
  });

  it("no toca stock sin cantidad ni productos que no están", () => {
    const next = stockAfterOrder(current, [
      { externalId: "C", qty: 4 },
      { externalId: "Z", qty: 1 },
      { externalId: "A", qty: 0 },
    ]);
    expect(next.size).toBe(0);
  });

  it("detecta lo que pide más de lo publicado, sumando líneas", () => {
    expect(linesOverStock(current, [{ externalId: "A", qty: 5 }])).toEqual([]);
    expect(
      linesOverStock(current, [
        { externalId: "A", qty: 3, name: "Placa" },
        { externalId: "A", qty: 3 },
        { externalId: "C", qty: 99 },
      ])
    ).toEqual([{ externalId: "A", name: "Placa", asked: 6, available: 5 }]);
  });
});

describe("nombres y precios", () => {
  it("la organización de la tienda no se llama igual que el comercio", () => {
    expect(storefrontSupplierName(" The Gamer Shop ")).toBe("The Gamer Shop (local)");
    expect(storefrontSupplierName("The Gamer Shop", 2)).toBe("The Gamer Shop (local 2)");
  });

  it("final con IVA como el importador", () => {
    expect(finalFromNet(100, 21)).toBe(121);
    expect(finalFromNet(100, 10.5)).toBe(110.5);
    expect(finalFromNet(99.99, 0)).toBe(99.99);
  });
});
