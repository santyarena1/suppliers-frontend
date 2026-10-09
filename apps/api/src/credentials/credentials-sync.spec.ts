import { CredentialsService } from "./credentials.service";

function setup(config: { syncIntervalMinutes: number } | null) {
  const prisma = {
    credential: {
      upsert: jest.fn().mockResolvedValue({ providerName: "ELIT", credentialsEncrypted: "enc" }),
    },
    providerSyncConfig: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(config),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const crypto = { encrypt: jest.fn(() => "enc"), decrypt: jest.fn(() => "{}") };
  const visibility = { ensureLinked: jest.fn() };
  const service = new CredentialsService(prisma as never, crypto as never, visibility as never);
  return { service, prisma };
}

const DTO = { providerName: "ELIT", credentials: { id: "123", password: "x" } } as never;

describe("cargar una cuenta deja la sincronización automática prendida", () => {
  it("primera vez: crea la configuración cada 1 h", async () => {
    const { service, prisma } = setup(null);
    await service.save("t1", "u1", DTO);
    expect(prisma.providerSyncConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ enabled: true, syncIntervalMinutes: 60, priceChannel: "API" }),
    });
  });

  it("si ya había sincronizado y estaba apagada, la vuelve a prender", async () => {
    const { service, prisma } = setup({ syncIntervalMinutes: 60 });
    await service.save("t1", "u1", DTO);
    expect(prisma.providerSyncConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: true, syncIntervalMinutes: 60 } })
    );
  });

  it("respeta el intervalo que el comercio ya había elegido", async () => {
    const { service, prisma } = setup({ syncIntervalMinutes: 30 });
    await service.save("t1", "u1", DTO);
    expect(prisma.providerSyncConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: true, syncIntervalMinutes: 30 } })
    );
  });
});
