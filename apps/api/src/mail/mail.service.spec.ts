import { ServiceUnavailableException } from "@nestjs/common";
import { MailService } from "./mail.service";

describe("MailService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("en desarrollo sin proveedor escribe el cuerpo en el log", async () => {
    const { Logger } = await import("@nestjs/common");
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const service = new MailService({
      get: jest.fn((key: string) => (key === "NODE_ENV" ? "test" : undefined)),
    } as never);
    await service.send({ to: "a@b.c", subject: "Hola", text: "cuerpo", html: "<p>cuerpo</p>" });
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain("a@b.c");
  });

  it("en producción sin proveedor falla", async () => {
    const service = new MailService({
      get: jest.fn((key: string) => (key === "NODE_ENV" ? "production" : undefined)),
    } as never);
    await expect(
      service.send({ to: "a@b.c", subject: "Hola", text: "cuerpo", html: "<p>cuerpo</p>" })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("manda por Resend cuando hay API key", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new MailService({
      get: jest.fn((key: string) => {
        if (key === "RESEND_API_KEY") return "re_test";
        if (key === "MAIL_FROM") return "NODO <nodo@test>";
        return undefined;
      }),
    } as never);
    await service.send({ to: "a@b.c", subject: "Hola", text: "cuerpo", html: "<p>cuerpo</p>" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test" }),
      })
    );
  });
});
