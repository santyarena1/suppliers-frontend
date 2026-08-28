import { brandPlaceholderUsername, newPublicKey } from "./brand-orgs";

describe("brandPlaceholderUsername", () => {
  it("arma un usuario interno sin espacios ni tildes", () => {
    expect(brandPlaceholderUsername("ASUS")).toBe("marca.asus");
    expect(brandPlaceholderUsername("Gigabyte Aorus")).toBe("marca.gigabyteaorus");
    expect(brandPlaceholderUsername("Ñandú")).toBe("marca.nandu");
  });
});

describe("newPublicKey", () => {
  it("es opaca y corta, no un slug", () => {
    const key = newPublicKey();
    expect(key).toMatch(/^[a-z0-9]+$/);
    expect(key.length).toBeGreaterThanOrEqual(10);
    expect(key.length).toBeLessThanOrEqual(16);
    expect(key).not.toContain("asus");
  });
});
