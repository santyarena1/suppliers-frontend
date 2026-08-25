import { AccountPortalCache, wantsRefresh } from "./account-portal-cache";

describe("AccountPortalCache", () => {
  it("cachea y respeta refresh", async () => {
    const cache = new AccountPortalCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return { n: calls };
    };

    const a = await cache.wrap("t:P:cta", false, loader);
    const b = await cache.wrap("t:P:cta", false, loader);
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(calls).toBe(1);

    const c = await cache.wrap("t:P:cta", true, loader);
    expect(c).toEqual({ n: 2 });
    expect(calls).toBe(2);
  });

  it("wantsRefresh", () => {
    expect(wantsRefresh("1")).toBe(true);
    expect(wantsRefresh("true")).toBe(true);
    expect(wantsRefresh(undefined)).toBe(false);
    expect(wantsRefresh("0")).toBe(false);
  });
});
