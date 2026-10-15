import {
  finalFromNet,
  isStockFresh,
  linesOverStock,
  shouldWarnStale,
  stockAfterOrder,
  stockExpiresAt,
  storefrontHiddenReason,
  storefrontSupplierName,
  stockState,
  displayNameProblem,
  nameKey,
  normalizeImageRefs,
  pickAllowed,
  sniffImage,
  PAYMENT_METHODS,
  conditionFromText,
  imagesFromCell,
  sheetExtras,
} from "./storefront-rules";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-14T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("vigencia del stock de una tienda", () => {
  it("sin confirmar nunca, no está vigente ni vence", () => {
    expect(stockExpiresAt({ stockConfirmedAt: null, stockValidDays: 3 })).toBeNull();
    expect(isStockFresh({ stockConfirmedAt: null, stockValidDays: 3 }, now)).toBe(false);
    expect(stockState({ stockConfirmedAt: null, stockValidDays: 3 }, now)).toBe("UNCONFIRMED");
  });

  it("vale los días configurados y vence justo al cumplirse", () => {
    expect(isStockFresh({ stockConfirmedAt: ago(2 * DAY), stockValidDays: 3 }, now)).toBe(true);
    expect(isStockFresh({ stockConfirmedAt: ago(3 * DAY), stockValidDays: 3 }, now)).toBe(false);
    expect(isStockFresh({ stockConfirmedAt: ago(3 * DAY - 1000), stockValidDays: 3 }, now)).toBe(true);
  });

  it("con 0 días no vence nunca", () => {
    expect(stockExpiresAt({ stockConfirmedAt: now, stockValidDays: 0 })).toBeNull();
    expect(isStockFresh({ stockConfirmedAt: null, stockValidDays: 0 }, now)).toBe(true);
    expect(stockState({ stockConfirmedAt: ago(90 * DAY), stockValidDays: 0 }, now)).toBe("NO_EXPIRY");
  });

  it("estado: vigente, por vencer y vencido", () => {
    expect(stockState({ stockConfirmedAt: ago(DAY), stockValidDays: 3 }, now)).toBe("FRESH");
    expect(stockState({ stockConfirmedAt: ago(2.5 * DAY), stockValidDays: 3 }, now)).toBe("DUE_SOON");
    expect(stockState({ stockConfirmedAt: ago(4 * DAY), stockValidDays: 3 }, now)).toBe("EXPIRED");
    // Con un día de vigencia, la ventana de aviso es de 6 h.
    expect(stockState({ stockConfirmedAt: ago(12 * 60 * 60 * 1000), stockValidDays: 1 }, now)).toBe("FRESH");
    expect(stockState({ stockConfirmedAt: ago(20 * 60 * 60 * 1000), stockValidDays: 1 }, now)).toBe("DUE_SOON");
  });
});

describe("por qué una tienda no se ve", () => {
  const base = { status: "ACTIVE" as const, stockConfirmedAt: ago(DAY), stockValidDays: 3, ownerActive: true };

  it("activa, con stock vigente y comercio activo: se ve", () => {
    expect(storefrontHiddenReason(base, now)).toBeNull();
  });

  it("orden de motivos: comercio inactivo, frenada, cerrada, pausada", () => {
    expect(storefrontHiddenReason({ ...base, ownerActive: false, status: "SUSPENDED" }, now)).toBe("OWNER_INACTIVE");
    expect(storefrontHiddenReason({ ...base, status: "SUSPENDED" }, now)).toBe("SUSPENDED");
    expect(storefrontHiddenReason({ ...base, status: "CLOSED" }, now)).toBe("CLOSED");
    expect(storefrontHiddenReason({ ...base, status: "PAUSED" }, now)).toBe("PAUSED");
  });

  it("stock vencido o sin confirmar: por defecto sigue visible", () => {
    expect(storefrontHiddenReason({ ...base, stockConfirmedAt: null }, now)).toBeNull();
    expect(storefrontHiddenReason({ ...base, stockConfirmedAt: ago(40 * DAY) }, now)).toBeNull();
    expect(storefrontHiddenReason({ ...base, staleAction: "KEEP", stockConfirmedAt: ago(40 * DAY) }, now)).toBeNull();
  });

  it("si el dueño eligió ocultarla, se oculta al vencer", () => {
    const hide = { ...base, staleAction: "HIDE" };
    expect(storefrontHiddenReason({ ...hide, stockConfirmedAt: null }, now)).toBe("NO_STOCK_CONFIRMED");
    expect(storefrontHiddenReason({ ...hide, stockConfirmedAt: ago(4 * DAY) }, now)).toBe("STOCK_EXPIRED");
    expect(storefrontHiddenReason(hide, now)).toBeNull();
    // Sin vencimiento no hay nada que ocultar.
    expect(storefrontHiddenReason({ ...hide, stockValidDays: 0, stockConfirmedAt: null }, now)).toBeNull();
  });
});

describe("recordatorio de stock", () => {
  const base = { status: "ACTIVE" as const, stockValidDays: 3, staleWarnedAt: null };

  it("avisa cuando falta menos de un día", () => {
    expect(shouldWarnStale({ ...base, stockConfirmedAt: ago(2.5 * DAY) }, now)).toBe(true);
    expect(shouldWarnStale({ ...base, stockConfirmedAt: ago(1 * DAY) }, now)).toBe(false);
  });

  it("también avisa si ya venció y no se avisó", () => {
    expect(shouldWarnStale({ ...base, stockConfirmedAt: ago(10 * DAY) }, now)).toBe(true);
  });

  it("no repite antes de vencer; vencido, repite cada tantos días como la vigencia", () => {
    const confirmed = ago(2.5 * DAY);
    expect(shouldWarnStale({ ...base, stockConfirmedAt: confirmed, staleWarnedAt: ago(0.2 * DAY) }, now)).toBe(false);
    // Avisado antes de la última confirmación: es un vencimiento nuevo.
    expect(shouldWarnStale({ ...base, stockConfirmedAt: confirmed, staleWarnedAt: ago(5 * DAY) }, now)).toBe(true);
    const expired = ago(8 * DAY);
    expect(shouldWarnStale({ ...base, stockConfirmedAt: expired, staleWarnedAt: ago(2 * DAY) }, now)).toBe(false);
    expect(shouldWarnStale({ ...base, stockConfirmedAt: expired, staleWarnedAt: ago(3 * DAY) }, now)).toBe(true);
  });

  it("después de un mes vencido deja de insistir", () => {
    expect(shouldWarnStale({ ...base, stockConfirmedAt: ago(40 * DAY), staleWarnedAt: ago(5 * DAY) }, now)).toBe(false);
  });

  it("nada que avisar si está pausada, cerrada, no vence o nunca confirmó", () => {
    expect(shouldWarnStale({ ...base, status: "PAUSED", stockConfirmedAt: ago(10 * DAY) }, now)).toBe(false);
    expect(shouldWarnStale({ ...base, status: "CLOSED", stockConfirmedAt: ago(10 * DAY) }, now)).toBe(false);
    expect(shouldWarnStale({ ...base, stockValidDays: 0, stockConfirmedAt: ago(10 * DAY) }, now)).toBe(false);
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

describe("nombre público", () => {
  it("compara sin acentos, mayúsculas ni signos", () => {
    expect(nameKey("  Él Gamer-Shop! ")).toBe("elgamershop");
  });

  it("rechaza cortos, largos, de NODO y los que ya usa otro", () => {
    const taken = new Set([nameKey("Elit"), nameKey("Invid Computers")]);
    expect(displayNameProblem("A", taken)).toMatch(/al menos/);
    expect(displayNameProblem("x".repeat(61), taken)).toMatch(/60/);
    expect(displayNameProblem("N.O.D.O", taken)).toMatch(/NODO/);
    expect(displayNameProblem("ELIT", taken)).toMatch(/ya lo usa/);
    expect(displayNameProblem("invid  computers", taken)).toMatch(/ya lo usa/);
    expect(displayNameProblem("Gamer Palermo", taken)).toBeNull();
  });
});

describe("condiciones y fotos", () => {
  it("solo opciones conocidas, sin repetir, en orden", () => {
    expect(pickAllowed(["CARD", "CASH", "CASH", "<script>", 3], PAYMENT_METHODS)).toEqual(["CASH", "CARD"]);
    expect(pickAllowed("CASH", PAYMENT_METHODS)).toEqual([]);
  });

  it("fotos: assets de NODO y https, sin repetir ni pasarse", () => {
    const id = "0b4f1a52-3c6d-4e8f-9a1b-2c3d4e5f6a7b";
    const ok = normalizeImageRefs([`/assets/${id.toUpperCase()}`, `/assets/${id}`, "https://cdn.x.com/a.jpg", " "]);
    expect(ok).toEqual({ refs: [`/assets/${id}`, "https://cdn.x.com/a.jpg"], assetIds: [id] });
    expect(normalizeImageRefs(["javascript:alert(1)"])).toHaveProperty("error");
    expect(normalizeImageRefs(["ftp://x.com/a.jpg"])).toHaveProperty("error");
    expect(normalizeImageRefs(["data:image/png;base64,AAAA"])).toHaveProperty("error");
    expect(normalizeImageRefs(["http://x.com/a.jpg"])).toHaveProperty("refs");
    expect(normalizeImageRefs(["/assets/../../etc"])).toHaveProperty("error");
    expect(normalizeImageRefs(Array.from({ length: 9 }, (_, i) => `https://x.com/${i}.jpg`))).toHaveProperty("error");
    expect(normalizeImageRefs("https://x.com/a.jpg")).toHaveProperty("error");
  });

  it("reconoce la imagen por sus bytes, no por lo que dice el navegador", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]))).toBe("image/webp");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(Buffer.from("<html>"))).toBeNull();
  });
});

describe("estado y fotos desde la planilla", () => {
  it("entiende el estado escrito a mano", () => {
    expect(conditionFromText("Nuevo")).toBe("NEW");
    expect(conditionFromText("SELLADO")).toBe("NEW");
    expect(conditionFromText("usada")).toBe("USED");
    expect(conditionFromText("Caja abierta")).toBe("OPEN_BOX");
    expect(conditionFromText("Reacondicionado")).toBe("REFURBISHED");
    expect(conditionFromText("excelente")).toBeNull();
    expect(conditionFromText(5)).toBeNull();
  });

  it("varias fotos por celda, solo links http(s), sin repetir y hasta 8", () => {
    expect(imagesFromCell("https://a.com/1.jpg, https://a.com/2.jpg\nwww.b.com/3.png | javascript:alert(1) data:image/png;base64,xx https://a.com/1.jpg")).toEqual([
      "https://a.com/1.jpg",
      "https://a.com/2.jpg",
      "https://www.b.com/3.png",
    ]);
    expect(imagesFromCell(Array.from({ length: 12 }, (_, i) => `https://a.com/${i}.jpg`).join(" "))).toHaveLength(8);
    expect(imagesFromCell("=IMAGE(\"https://a.com/x.jpg\")")).toEqual([]);
  });

  it("toma las columnas por su encabezado y respeta lo de NODO si están vacías", () => {
    expect(sheetExtras({ Código: "A1", Estado: "usado", Fotos: "https://a.com/1.jpg https://a.com/2.jpg" })).toEqual({
      condition: "USED",
      images: ["https://a.com/1.jpg", "https://a.com/2.jpg"],
    });
    expect(sheetExtras({ Código: "A1", Estado: "", Fotos: "" })).toEqual({});
    expect(sheetExtras({ Nombre: "Estado de la placa: usada" })).toEqual({});
  });
});
