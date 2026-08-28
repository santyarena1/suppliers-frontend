import { tenantLinkAllowed, tenantLinkRejection } from "./link-sides";

describe("tenantLinkAllowed", () => {
  it("deja comercio→distro, comercio→marca y distro→marca", () => {
    expect(tenantLinkAllowed("RETAILER", "DISTRIBUTOR")).toBe(true);
    expect(tenantLinkAllowed("RETAILER", "BRAND")).toBe(true);
    expect(tenantLinkAllowed("DISTRIBUTOR", "BRAND")).toBe(true);
  });

  it("rechaza el resto", () => {
    expect(tenantLinkAllowed("RETAILER", "RETAILER")).toBe(false);
    expect(tenantLinkAllowed("DISTRIBUTOR", "DISTRIBUTOR")).toBe(false);
    expect(tenantLinkAllowed("DISTRIBUTOR", "RETAILER")).toBe(false);
    expect(tenantLinkAllowed("BRAND", "RETAILER")).toBe(false);
    expect(tenantLinkAllowed("BRAND", "DISTRIBUTOR")).toBe(false);
    expect(tenantLinkAllowed("BRAND", "BRAND")).toBe(false);
  });

  it("explica el rechazo sin filtrar nombres", () => {
    expect(tenantLinkRejection("BRAND", "RETAILER")).toMatch(/marca/i);
    expect(tenantLinkRejection("RETAILER", "DISTRIBUTOR")).toBeNull();
  });
});
