import { DEFAULT_API_CLIENT_CONFIG, type ApiClientConfig } from "@nodo/shared";
import { decodeChanges, encodeChanges } from "./changes/changes-feed.service";
import { decimalText, diffOffer, productHash, type OfferStateLike } from "./changes/offer-diff";
import type { CatalogRow, ProviderInfo } from "./core/catalog-row";
import { offerIdFor } from "./core/ids";
import { makeConverter } from "./core/pricing";
import { groupRows, offerView, productView, rowVisibleForKey, stockStatus, type ProjectionContext } from "./core/projection";
import { csvCell } from "./export/export-format";
import { feedItem, googleFeedItem, productLink } from "./export/feed-format";
import { ConfigInputError, parseConfigInput, parseIpAllowlist, parseScopes } from "./manage/config-input";
import { assertWebhookUrl, isBlockedIp } from "./webhooks/ssrf";
import { itemsFor, MAX_ATTEMPTS, nextAttemptAfter } from "./webhooks/webhook-events";
import { signPayload, verifySignature } from "./webhooks/webhook-signature";

function row(patch: Partial<CatalogRow>): CatalogRow {
  const provider = patch.provider ?? "ELIT";
  const externalId = patch.externalId ?? "1";
  return {
    offerId: offerIdFor(provider, externalId),
    provider,
    externalId,
    groupKey: "g1",
    productId: "prd_g1",
    sku: null,
    partNumber: null,
    ean: null,
    name: "Producto",
    brand: "ASUS",
    category: "Placas de video",
    subcategory: null,
    description: null,
    longDescription: null,
    imageUrl: null,
    imageAiSelected: false,
    gallery: [],
    productUrl: null,
    warranty: null,
    weight: null,
    weightUnit: null,
    height: null,
    width: null,
    length: null,
    dimensionsUnit: null,
    volume: null,
    tags: [],
    currency: "USD",
    costNet: 100,
    costTaxes: [],
    ivaPercent: 21,
    saleMarginPercent: 0,
    saleMarginBase: "NET",
    stock: 5,
    stockStatus: null,
    minStockThreshold: 0,
    strictStock: false,
    source: "SYNC",
    syncedAt: new Date("2026-10-05T00:00:00Z"),
    updatedAt: new Date("2026-10-05T00:00:00Z"),
    searchText: "producto",
    ...patch,
  };
}

const providers = new Map<string, ProviderInfo>([
  ["ELIT", { key: "ELIT", name: "Elit", aliasId: "prv_e", aliasName: "Proveedor 1", lastSyncedAt: null, stale: false, status: "ok", pauseReason: null }],
  ["AIR", { key: "AIR", name: "Air", aliasId: "prv_a", aliasName: "Proveedor 2", lastSyncedAt: null, stale: true, status: "paused", pauseReason: "403" }],
]);

function ctx(config: Partial<ApiClientConfig> = {}): ProjectionContext {
  return { config: { ...DEFAULT_API_CLIENT_CONFIG, ...config }, providers, convert: makeConverter("USD", 1000) };
}

describe("proyección por key", () => {
  it("stock: sin stock afuera salvo que la key lo pida; null cuenta como disponible", () => {
    const cfg = { ...DEFAULT_API_CLIENT_CONFIG };
    expect(rowVisibleForKey(row({ stock: 0 }), cfg)).toBe(false);
    expect(rowVisibleForKey(row({ stock: null }), cfg)).toBe(true);
    expect(rowVisibleForKey(row({ stock: null, strictStock: true }), cfg)).toBe(false);
    expect(rowVisibleForKey(row({ stock: 0 }), { ...cfg, includeOutOfStock: true })).toBe(true);
    expect(rowVisibleForKey(row({ stock: 3 }), { ...cfg, minStock: 5 })).toBe(false);
    expect(rowVisibleForKey(row({ provider: "AIR" }), { ...cfg, providers: { mode: "only", keys: ["ELIT"] } })).toBe(false);
  });

  it("estado del stock", () => {
    expect(stockStatus({ stock: 0, stockStatus: null })).toBe("out_of_stock");
    expect(stockStatus({ stock: 3, stockStatus: "Stock bajo" })).toBe("low");
    expect(stockStatus({ stock: 3, stockStatus: null })).toBe("in_stock");
    expect(stockStatus({ stock: null, stockStatus: null })).toBe("unknown");
  });

  it("identidad oculta: alias y sin código del distribuidor; visible: nombre y clave", () => {
    const hidden = offerView(row({}), ctx(), false);
    expect(hidden.provider).toEqual({ id: "prv_e", name: "Proveedor 1" });
    expect(hidden.externalId).toBeUndefined();
    const visible = offerView(row({}), ctx({ providerIdentity: "visible" }), false);
    expect(visible.provider).toEqual({ id: "prv_e", name: "Elit", key: "ELIT" });
    expect(visible.externalId).toBe("1");
    expect(offerView(row({ provider: "AIR" }), ctx(), false).freshness).toMatchObject({ stale: true, providerSync: "paused" });
  });

  it("agrupa y elige la mejor oferta: con stock primero, después la más barata", () => {
    const rows = [
      row({ provider: "ELIT", externalId: "1", costNet: 90, stock: 0, imageUrl: "https://x/1.jpg" }),
      row({ provider: "AIR", externalId: "2", costNet: 110, stock: 4 }),
      row({ provider: "ELIT", externalId: "3", costNet: 100, stock: 2 }),
    ];
    const [group] = groupRows(rows, ctx());
    const product = productView(group, ctx());
    expect(product.offers).toHaveLength(3);
    expect(product.bestOffer?.id).toBe(offerIdFor("ELIT", "3"));
    expect(product.availability).toEqual({ inStock: true, totalStock: 6, offers: 3 });
    expect(product.images).toEqual([{ url: "https://x/1.jpg", source: "provider" }]);
    expect(product.priceRange).toMatchObject({ min: 90, max: 110 });
  });
});

describe("rastreo de cambios", () => {
  const base: OfferStateLike = { price: "100.0000", finalPrice: "121.0000", stock: 5, active: true, productHash: "h" };

  it("alta, baja, precio, stock y ficha", () => {
    expect(diffOffer(null, base)?.type).toBe("offer.created");
    expect(diffOffer(base, { ...base, active: false })?.type).toBe("offer.removed");
    expect(diffOffer(base, { ...base, price: "90.0000" })).toMatchObject({ type: "offer.updated", changed: ["price"] });
    expect(diffOffer(base, { ...base, stock: 0, productHash: "otro" })?.changed).toEqual(["stock", "product"]);
    expect(diffOffer(base, { ...base })).toBeNull();
    expect(diffOffer(null, { ...base, active: false })).toBeNull();
  });

  it("decimales y hash de ficha estables", () => {
    expect(decimalText("100")).toBe(decimalText(100.0));
    expect(productHash({ name: "A", brand: "B" })).toBe(productHash({ brand: "B", name: "A" }));
    expect(productHash({ name: "A" })).not.toBe(productHash({ name: "A2" }));
  });

  it("cursor del feed de cambios: vence a los 30 días", () => {
    const now = Date.now();
    expect(decodeChanges(encodeChanges(42n, now), now)).toBe(42n);
    expect(() => decodeChanges(encodeChanges(42n, now - 31 * 86_400_000), now)).toThrow(expect.objectContaining({ code: "cursor_expired" }));
    expect(() => decodeChanges("nada")).toThrow(expect.objectContaining({ code: "invalid_cursor" }));
  });
});

describe("webhooks", () => {
  it("firma y verificación (con tolerancia de tiempo)", () => {
    const now = 1_790_000_000_000;
    const header = signPayload("whsec_x", '{"a":1}', Math.floor(now / 1000));
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifySignature("whsec_x", '{"a":1}', header, 300, now)).toBe(true);
    expect(verifySignature("whsec_x", '{"a":2}', header, 300, now)).toBe(false);
    expect(verifySignature("whsec_y", '{"a":1}', header, 300, now)).toBe(false);
    expect(verifySignature("whsec_x", '{"a":1}', header, 300, now + 10 * 60_000)).toBe(false);
  });

  it("SSRF: nada de redes internas ni http a otro lado", () => {
    for (const ip of ["127.0.0.1", "10.2.3.4", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("2606:4700::1111")).toBe(false);
    expect(() => assertWebhookUrl("http://ejemplo.com/x")).toThrow();
    expect(() => assertWebhookUrl("https://user:pass@ejemplo.com/x")).toThrow();
    expect(() => assertWebhookUrl("https://10.0.0.1/x")).toThrow();
    expect(assertWebhookUrl("https://ejemplo.com/hook").hostname).toBe("ejemplo.com");
  });

  it("reintentos: 1 min, 5 min, … y después no se reintenta más", () => {
    const now = new Date(0);
    expect(nextAttemptAfter(1, now)?.getTime()).toBe(60_000);
    expect(nextAttemptAfter(2, now)?.getTime()).toBe(5 * 60_000);
    expect(nextAttemptAfter(7, now)?.getTime()).toBe(24 * 3_600_000);
    expect(nextAttemptAfter(MAX_ATTEMPTS, now)).toBeNull();
  });

  it("cada webhook recibe solo los eventos a los que se suscribió", () => {
    const items = [
      { id: "1", type: "offer.updated" as const, at: "", changed: ["price" as const] },
      { id: "2", type: "offer.updated" as const, at: "", changed: ["product" as const] },
      { id: "3", type: "offer.removed" as const, at: "" },
    ];
    const got = itemsFor(["price.changed", "offer.removed"], items);
    expect(got.map((i) => i.id)).toEqual(["1", "3"]);
    expect(got[0].events).toEqual(["offer.updated", "price.changed"]);
  });
});

describe("export y feeds", () => {
  it("CSV: escapa comillas, separadores y fórmulas", () => {
    expect(csvCell('a"b', ",")).toBe('"a""b"');
    expect(csvCell("a;b", ";")).toBe('"a;b"');
    expect(csvCell("=HYPERLINK(1)", ",")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null, ",")).toBe("");
    expect(csvCell(12.5, ",")).toBe("12.5");
  });

  it("link del producto desde la plantilla", () => {
    const p = { id: "prd_1", name: "Placa RTX 4060 Ñandú", sku: "A/B", ean: null, partNumber: null } as never;
    expect(productLink("https://t.com/p/{slug}-{id}?sku={sku}", p)).toBe("https://t.com/p/placa-rtx-4060-nandu-prd_1?sku=A%2FB");
  });

  it("Google: solo con precio y foto, sin GTIN inválido y escapando XML", () => {
    const [group] = groupRows([row({ name: "A & B <x>", imageUrl: "https://x/1.jpg", ean: "4006381333932" })], ctx());
    const product = productView(group, ctx());
    const item = feedItem(product, "https://t.com/{id}")!;
    expect(item.gtin).toBeNull();
    const xml = googleFeedItem(item);
    expect(xml).toContain("<title>A &amp; B &lt;x&gt;</title>");
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
    const [noImage] = groupRows([row({ imageUrl: null })], ctx());
    expect(feedItem(productView(noImage, ctx()), "https://t.com/{id}")).toBeNull();
  });
});

describe("config de una key", () => {
  it("completa con defaults y valida", () => {
    const cfg = parseConfigInput({ price: { currency: "ARS", markup: { mode: "fixed", percent: 30 } } }, null, ["ELIT"]);
    expect(cfg.price).toMatchObject({ currency: "ARS", markup: { mode: "fixed", percent: 30 }, includeCost: true });
    expect(cfg.defaultView).toBe("products");
  });

  it("junta todos los problemas en criollo", () => {
    const run = () =>
      parseConfigInput({ providers: { mode: "only", keys: ["XX"] }, price: { rounding: "7", fxRate: "fixed" }, feed: { productUrlTemplate: "http://x" } }, null, ["ELIT"]);
    expect(run).toThrow(ConfigInputError);
    try {
      run();
    } catch (err) {
      expect((err as ConfigInputError).problems.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("permisos e IPs", () => {
    expect(parseScopes(undefined)).toContain("catalog:read");
    expect(() => parseScopes(["catalog:write"])).toThrow(ConfigInputError);
    expect(parseIpAllowlist(["10.0.0.0/8", " 10.0.0.0/8 "])).toEqual(["10.0.0.0/8"]);
    expect(() => parseIpAllowlist(["999.1.1.1"])).toThrow(ConfigInputError);
  });
});
