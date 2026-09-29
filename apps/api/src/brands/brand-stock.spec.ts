import {
  DEFAULT_STOCK_SETTINGS,
  groupSkusIntoItems,
  levelFromStock,
  semaphoreStatus,
  validStockSettings,
} from "./brand-stock";

const now = new Date("2026-09-29T12:00:00Z");
const recent = new Date("2026-09-29T08:00:00Z");
const old = new Date("2026-09-26T08:00:00Z");
const manual = { ...DEFAULT_STOCK_SETTINGS, mode: "MANUAL" as const };

describe("levelFromStock", () => {
  it("sin stock, bajo, medio y alto según los rangos de la marca", () => {
    const s = { lowBelow: 5, highFrom: 20 };
    expect(levelFromStock(0, s)).toBe("NONE");
    expect(levelFromStock(3, s)).toBe("LOW");
    expect(levelFromStock(5, s)).toBe("MEDIUM");
    expect(levelFromStock(19, s)).toBe("MEDIUM");
    expect(levelFromStock(20, s)).toBe("HIGH");
  });
});

describe("semaphoreStatus", () => {
  it("automático: sale del stock sincronizado", () => {
    expect(semaphoreStatus({ settings: DEFAULT_STOCK_SETTINGS, stock: 40, syncedAt: recent, now })).toBe("HIGH");
  });

  it("automático: sin sincronización reciente es sin dato", () => {
    expect(semaphoreStatus({ settings: DEFAULT_STOCK_SETTINGS, stock: 40, syncedAt: old, now })).toBe("UNKNOWN");
    expect(semaphoreStatus({ settings: DEFAULT_STOCK_SETTINGS, stock: null, syncedAt: recent, now })).toBe("UNKNOWN");
  });

  it("manual: la luz que eligió la marca", () => {
    expect(semaphoreStatus({ settings: manual, manualLevel: "LOW", stock: 90, syncedAt: recent, now })).toBe("LOW");
    expect(semaphoreStatus({ settings: manual, now })).toBe("UNKNOWN");
  });

  it("el estado de la marca (próximo ingreso, discontinuado) pisa todo", () => {
    expect(semaphoreStatus({ settings: DEFAULT_STOCK_SETTINGS, itemState: "INCOMING", stock: 0, syncedAt: recent, now })).toBe("INCOMING");
    expect(semaphoreStatus({ settings: manual, itemState: "DISCONTINUED", manualLevel: "HIGH", now })).toBe("DISCONTINUED");
  });
});

describe("validStockSettings", () => {
  it("bajo desde 1 y alto mayor que bajo", () => {
    expect(validStockSettings({ lowBelow: 5, highFrom: 20 })).toBe(true);
    expect(validStockSettings({ lowBelow: 0, highFrom: 20 })).toBe(false);
    expect(validStockSettings({ lowBelow: 10, highFrom: 10 })).toBe(false);
  });
});

describe("groupSkusIntoItems", () => {
  it("junta el mismo producto de varios distribuidores por EAN o part number", () => {
    const items = groupSkusIntoItems([
      { provider: "ELIT", externalId: "1", name: "Mouse G203", ean: "0097855123456", imageUrl: "a.jpg" },
      { provider: "AIR", externalId: "A1", name: "MOUSE LOGITECH G203", ean: "97855123456" },
      { provider: "NEW_BYTES", externalId: "9", name: "Logitech G203", partNumber: "910-005793", ean: "97855123456" },
      { provider: "INVID", externalId: "X", name: "G203 negro", partNumber: "910 005793", ean: null },
      { provider: "ELIT", externalId: "2", name: "Teclado K120", partNumber: "920-002479" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].skus.map((s) => s.provider)).toEqual(["ELIT", "AIR", "NEW_BYTES", "INVID"]);
    expect(items[0].imageUrl).toBe("a.jpg");
    expect(items[0].partNumber).toBe("910-005793");
    expect(items[1].name).toBe("Teclado K120");
  });

  it("no mezcla dos códigos del mismo distribuidor en un producto", () => {
    const items = groupSkusIntoItems([
      { provider: "ELIT", externalId: "1", name: "A", ean: "7790001234567" },
      { provider: "ELIT", externalId: "2", name: "A bis", ean: "7790001234567" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].skus).toHaveLength(1);
  });

  it("un código sin EAN ni part number es su propio producto", () => {
    const items = groupSkusIntoItems([
      { provider: "ELIT", externalId: "1", name: "Cable" },
      { provider: "AIR", externalId: "2", name: "Cable" },
    ]);
    expect(items).toHaveLength(2);
  });
});
