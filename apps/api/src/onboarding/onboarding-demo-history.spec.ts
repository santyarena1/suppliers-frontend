import { isDemoOrderNote } from "./onboarding-demo";
import { ORDER_DAYS, buildDemoOrders, buildDemoPriceHistory, resolveTourHref, type DemoHistoryProduct } from "./onboarding-demo-history";
import { RETAILER_ONBOARDING_STEPS } from "./onboarding-steps";

const NOW = new Date("2026-10-02T15:00:00Z");
const product = (provider: string, i: number): DemoHistoryProduct => ({
  provider,
  externalId: `${provider}-${i}`,
  sku: `SKU${i}`,
  name: `Producto ${i}`,
  price: 10 + i,
  finalPrice: (10 + i) * 1.21,
  ivaPercent: i % 2 ? 10.5 : 21,
});
const PRODUCTS = [
  ...Array.from({ length: 5 }, (_, i) => product("LIST_DEMO_NORTE", i)),
  ...Array.from({ length: 5 }, (_, i) => product("LIST_DEMO_SUR", i + 10)),
];

describe("pedidos de ejemplo del recorrido", () => {
  const orders = buildDemoOrders(PRODUCTS, NOW);

  it("arma la historia de ~3 meses, con los dos distribuidores demo", () => {
    expect(orders).toHaveLength(ORDER_DAYS.length);
    expect(new Set(orders.map((o) => o.provider))).toEqual(new Set(["LIST_DEMO_NORTE", "LIST_DEMO_SUR"]));
    const oldest = Math.min(...orders.map((o) => o.createdAt.getTime()));
    expect((NOW.getTime() - oldest) / 86_400_000).toBeGreaterThan(80);
  });

  it("el más reciente es online, con número de pedido del distribuidor", () => {
    const latest = [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    expect(latest.channel).toBe("ONLINE");
    expect(latest.status).toBe("CREATED");
    expect(latest.orderNumber).toMatch(/^D[NS]-\d+$/);
    expect(latest.paymentLabel).toBeTruthy();
  });

  it("mezcla online y offline, y los offline no llevan número", () => {
    const offline = orders.filter((o) => o.channel === "OFFLINE");
    expect(offline.length).toBeGreaterThan(0);
    expect(orders.length - offline.length).toBeGreaterThan(offline.length);
    expect(offline.every((o) => o.orderNumber === null && o.status === "OFFLINE")).toBe(true);
  });

  it("los ítems usan qty (lo que leen las estadísticas) y los totales cierran", () => {
    for (const order of orders) {
      expect(order.items.every((it) => it.qty > 0 && it.unitPrice > 0)).toBe(true);
      const net = order.items.reduce((s, it) => s + it.lineTotal, 0);
      expect(order.subtotal).toBeCloseTo(net, 2);
      expect(order.total).toBeCloseTo(order.subtotal + order.impuestos, 2);
    }
  });

  it("todos quedan marcados como demo", () => {
    expect(orders.every((o) => isDemoOrderNote(o.notes))).toBe(true);
  });

  it("sin productos con precio no inventa pedidos", () => {
    expect(buildDemoOrders([{ ...PRODUCTS[0], price: 0 }], NOW)).toEqual([]);
  });
});

describe("bajas de precio de ejemplo", () => {
  it("cada producto estaba más caro hace unos días y hoy vale su precio actual", () => {
    const points = buildDemoPriceHistory(PRODUCTS, NOW, 4);
    expect(points).toHaveLength(8);
    for (let i = 0; i < points.length; i += 2) {
      const [before, today] = [points[i], points[i + 1]];
      expect(before.externalId).toBe(today.externalId);
      expect(before.capturedAt.getTime()).toBeLessThan(today.capturedAt.getTime());
      expect(before.price).toBeGreaterThan(today.price);
      const drop = (before.price - today.price) / before.price;
      expect(drop).toBeGreaterThan(0.04);
      expect(drop).toBeLessThan(0.2);
    }
  });
});

describe("marcadores de los pasos", () => {
  const demo = { search: "Logitech G", product: "LIST_DEMO_NORTE/abc", provider: "LIST_DEMO_NORTE" };

  it("completa búsqueda, producto y distribuidor", () => {
    expect(resolveTourHref("/search?q={demoSearch}", demo)).toBe("/search?q=Logitech%20G");
    expect(resolveTourHref("/product/{demoProduct}", demo)).toBe("/product/LIST_DEMO_NORTE/abc");
    expect(resolveTourHref("/proveedores/{demoProvider}?tab=sync", demo)).toBe("/proveedores/LIST_DEMO_NORTE?tab=sync");
  });

  it("sin producto demo, la ficha cae a la búsqueda", () => {
    expect(resolveTourHref("/product/{demoProduct}", { ...demo, product: null })).toBe("/search?q=Logitech%20G");
  });

  it("todos los pasos del recorrido quedan sin marcadores sueltos", () => {
    for (const step of RETAILER_ONBOARDING_STEPS) {
      expect(resolveTourHref(step.href, demo) ?? "").not.toMatch(/[{}]/);
    }
  });

  it("cada paso de la guía dentro de la app señala algo o va centrado a propósito", () => {
    const tour = RETAILER_ONBOARDING_STEPS.filter((s) => s.kind === "tour");
    const centered = tour.filter((s) => !s.spotlight).map((s) => s.id);
    expect(centered).toEqual(["welcome"]);
    expect(new Set(tour.map((s) => s.id)).size).toBe(tour.length);
  });
});
