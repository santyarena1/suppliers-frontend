import { normalizeOrderRow, parseNbOrderItems, parseNbSubtotales, parseNbTracking } from "./new-bytes.mapper";

// Formas reales de www.nb.com.ar (miCuenta), con valores de ejemplo.
const LIST_SUBTOTAL = {
  currencyQuote: 1540,
  subtotalDollar: 54.9136,
  subtotalDollarFinal: 66.445456,
  subTotalPesosAr: 84566.944,
  subTotalPesosArFinal: 102326.00224,
  perception: 0,
  perceptionPesosAr: 0,
};

describe("pedidos y órdenes de compra de New Bytes", () => {
  it("lee los importes del listado (subtotalDollar con minúscula)", () => {
    const row = normalizeOrderRow({ branch: "0002", albNumber: "00665488", date: "2026-09-30", statusDescription: "Entregado Cobrado", subtotal: LIST_SUBTOTAL });
    expect(row).toMatchObject({ subtotalUsd: 54.9136, totalUsd: 66.445456, totalArs: 102326.00224, exchangeRate: 1540, status: "Entregado Cobrado" });
  });

  it("orden de compra: color de estado, envío y usuario", () => {
    const row = normalizeOrderRow({
      status: 2,
      branch: "0002",
      orderNumber: "10482900",
      userName: "vendedor1",
      deliveryMethodDescription: "Retiro de cliente en Local",
      trackingNumber: "E001248142",
      paymentVoucher: false,
      subtotal: LIST_SUBTOTAL,
    });
    expect(row).toMatchObject({ statusColor: "yellow", status: "", delivery: "Retiro de cliente en Local", userName: "vendedor1", trackingNumber: "E001248142" });
  });

  it("líneas de un pedido: cantidad, neto, % IVA, final", () => {
    const items = parseNbOrderItems([
      { branch: "0002", albNumber: "00665488", productId: "123456", description: "Mouse Logitech G502", amount: "1.000", price: { value: 54.9136, iva: 21, internalTax: 0, finalPrice: 66.445456 }, currencyQuote: 0, perception: 0 },
    ]);
    expect(items).toEqual([
      expect.objectContaining({ code: "123456", name: "Mouse Logitech G502", qty: 1, price: 54.9136, finalPrice: 66.4455, ivaPercent: 21 }),
    ]);
    expect(items[0]).not.toHaveProperty("perception");
  });

  it("líneas de una orden de compra: el código viene en itemId", () => {
    const items = parseNbOrderItems([
      { orderId: "10482900", branch: "0002", description: "Teclado HyperX", itemId: 98765, amount: 2, status: 2, price: { value: 40, iva: 10.5, internalTax: 17, finalPrice: 50 } },
    ]);
    expect(items[0]).toMatchObject({ code: "98765", qty: 2, total: 80, internalTaxPercent: 17, status: "2" });
  });

  it("total de la orden (GET …/total)", () => {
    expect(parseNbSubtotales({ Cotizacion: 1535, SubtotalDollar: 54.9136, SubtotalDollarFinal: 66.445456, SubtotalPesosAr: 84292.376, SubtotalPesosArFinal: 101993.77496 })).toMatchObject({
      subtotalUsd: 54.9136,
      totalUsd: 66.445456,
      totalArs: 101993.77496,
      exchangeRate: 1535,
    });
  });

  it("seguimiento: la sucursal viene como `brach`", () => {
    expect(parseNbTracking([{ state: "En preparación", brach: "Sucursal Centro", address: "Av. Siempreviva 742", date: "2026-10-01 10:30" }])).toEqual([
      { state: "En preparación", branch: "Sucursal Centro", address: "Av. Siempreviva 742", date: "2026-10-01 10:30" },
    ]);
  });
});
