import {
  indexOpsAliases,
  isAliasable,
  normalizeOpsLabel,
  opsGroupKey,
  suggestOpsMerges,
} from "./purchase-ops-aliases";

describe("normalizeOpsLabel", () => {
  it("trata la misma dirección escrita distinto como igual", () => {
    expect(normalizeOpsLabel("Av. Rivadavia 1000, CABA")).toBe(normalizeOpsLabel("Avenida Rivadavia 1000 CABA"));
    expect(normalizeOpsLabel("Mitre 12, Rosario")).toBe(normalizeOpsLabel("mitre 12 rosario"));
  });
});

describe("suggestOpsMerges", () => {
  it("propone unificar direcciones equivalentes y no las ya agrupadas", () => {
    const raw = [
      { kind: "ADDRESS" as const, raw: "Av. Rivadavia 1000, CABA" },
      { kind: "ADDRESS" as const, raw: "Avenida Rivadavia 1000 CABA" },
    ];
    const suggested = suggestOpsMerges(raw);
    expect(suggested).toHaveLength(1);
    expect(suggested[0].keys).toHaveLength(2);

    const aliases = indexOpsAliases([
      { kind: "ADDRESS", rawKey: raw[0].raw, groupId: "g1", label: "Rivadavia 1000" },
      { kind: "ADDRESS", rawKey: raw[1].raw, groupId: "g1", label: "Rivadavia 1000" },
    ]);
    expect(suggestOpsMerges(raw, aliases)).toHaveLength(0);
  });

  it("no propone unificar placeholders", () => {
    expect(isAliasable("Sin dirección")).toBe(false);
    expect(suggestOpsMerges([{ kind: "ADDRESS", raw: "Sin dirección" }])).toHaveLength(0);
  });
});

describe("opsGroupKey", () => {
  it("arma la clave de grupo", () => {
    expect(opsGroupKey("abc")).toBe("group:abc");
  });
});
