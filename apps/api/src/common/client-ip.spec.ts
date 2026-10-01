import { clientIp } from "./client-ip";

describe("clientIp", () => {
  it("usa X-Real-IP, que Railway reescribe con la IP de quien se conecta", () => {
    expect(clientIp("186.139.59.87", "186.139.59.87, 46.151.194.129", "100.64.0.10")).toBe("186.139.59.87");
  });

  it("no cuenta por el borde de Railway (último salto de X-Forwarded-For)", () => {
    expect(clientIp(undefined, "186.139.59.87, 46.151.194.129", "100.64.0.10")).toBe("186.139.59.87");
  });

  it("sin headers usa la IP del socket", () => {
    expect(clientIp(undefined, undefined, "127.0.0.1")).toBe("127.0.0.1");
  });

  it("ignora basura en los headers", () => {
    expect(clientIp("no-es-ip", "tampoco", "127.0.0.1")).toBe("127.0.0.1");
  });
});
