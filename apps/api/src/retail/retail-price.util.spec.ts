import { RETAIL_PRICE_DB_MAX, normalizeExternalPrice } from "./retail-price.util";

describe("normalizeExternalPrice", () => {
  test("pesos normales pasan tal cual", () => {
    expect(normalizeExternalPrice(340_500)).toBe(340_500);
  });

  test("centavos de Multiplo se dividen", () => {
    expect(normalizeExternalPrice(1_218_600_000, 100)).toBe(12_186_000);
  });

  test("un valor que no entra en Decimal(14,4) se descarta como 0 en vez de reventar el upsert", () => {
    expect(normalizeExternalPrice(1_500_000_000_000, 100)).toBe(0);
    // Un entero grande sin divisor se asume centavos crudos y se corrige ÷100.
    expect(normalizeExternalPrice(RETAIL_PRICE_DB_MAX + 1)).toBe(100_000_000);
    expect(normalizeExternalPrice(12_345_678_901.5)).toBe(0);
  });
});
