import { withPortalCartLock } from "./portal-cart-lock";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("withPortalCartLock", () => {
  it("en la misma cuenta, una operación espera a que termine la otra", async () => {
    const log: string[] = [];
    const a = withPortalCartLock("ELIT:1", async () => {
      log.push("a:empieza");
      await tick();
      log.push("a:termina");
      return "a";
    });
    const b = withPortalCartLock("ELIT:1", async () => {
      log.push("b:empieza");
      return "b";
    });
    await expect(Promise.all([a, b])).resolves.toEqual(["a", "b"]);
    expect(log).toEqual(["a:empieza", "a:termina", "b:empieza"]);
  });

  it("cuentas distintas no se esperan", async () => {
    const log: string[] = [];
    const a = withPortalCartLock("ELIT:1", async () => {
      await tick();
      log.push("a");
    });
    const b = withPortalCartLock("ELIT:2", async () => {
      log.push("b");
    });
    await Promise.all([a, b]);
    expect(log).toEqual(["b", "a"]);
  });

  it("si una falla, la siguiente corre igual y el error le llega solo a la primera", async () => {
    const a = withPortalCartLock("ELIT:3", async () => {
      throw new Error("portal caído");
    });
    const b = withPortalCartLock("ELIT:3", async () => "ok");
    await expect(a).rejects.toThrow("portal caído");
    await expect(b).resolves.toBe("ok");
  });
});
