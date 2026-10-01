import { clientIp } from "./client-ip";

describe("clientIp", () => {
  it("toma la IP que agrega el proxy (la de más a la derecha)", () => {
    expect(clientIp("200.1.1.1", "100.64.0.2")).toBe("200.1.1.1");
  });

  it("un X-Forwarded-For falseado por el cliente no cambia el resultado", () => {
    expect(clientIp("1.2.3.4, 9.9.9.9, 200.1.1.1", "100.64.0.2")).toBe("200.1.1.1");
  });

  it("saltea los saltos internos del proxy", () => {
    expect(clientIp("200.1.1.1, 10.0.0.5", "100.64.0.2")).toBe("200.1.1.1");
  });

  it("sin header usa la IP del socket", () => {
    expect(clientIp(undefined, "127.0.0.1")).toBe("127.0.0.1");
  });

  it("ignora basura en el header", () => {
    expect(clientIp("no-es-ip, 200.1.1.1", undefined)).toBe("200.1.1.1");
  });
});
