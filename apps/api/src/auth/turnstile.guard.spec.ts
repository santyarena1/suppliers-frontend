import { ForbiddenException } from "@nestjs/common";
import { TurnstileGuard } from "./turnstile.guard";

function ctx(headers: Record<string, string>) {
  return { switchToHttp: () => ({ getRequest: () => ({ headers, ip: "100.64.0.2" }) }) } as never;
}
const guard = (secret = "s3cr3t") => new TurnstileGuard({ get: () => secret } as never);

describe("TurnstileGuard", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("sin clave configurada (local) no exige nada", async () => {
    await expect(guard("").canActivate(ctx({}))).resolves.toBe(true);
  });

  it("sin token rechaza", async () => {
    await expect(guard().canActivate(ctx({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("token válido pasa y se verifica con la IP real del cliente", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    global.fetch = fetchMock as never;
    await expect(guard().canActivate(ctx({ "x-turnstile-token": "ok", "x-real-ip": "186.1.2.3" }))).resolves.toBe(true);
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("remoteip")).toBe("186.1.2.3");
    expect(body.get("secret")).toBe("s3cr3t");
  });

  it("Cloudflare dice que no: rechaza", async () => {
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) }) as never;
    await expect(guard().canActivate(ctx({ "x-turnstile-token": "malo" }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("Cloudflare caído: deja pasar (nadie queda afuera por una caída ajena)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("timeout")) as never;
    await expect(guard().canActivate(ctx({ "x-turnstile-token": "x" }))).resolves.toBe(true);
  });
});
