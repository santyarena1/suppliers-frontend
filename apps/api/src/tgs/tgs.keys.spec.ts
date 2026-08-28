import { ConfigService } from "@nestjs/config";
import { CryptoService } from "../common/crypto/crypto.service";
import { TgsAccessService } from "./tgs.access";
import { maskHint, TgsKeysService } from "./tgs.keys";

const HEX = "ab".repeat(32);
const TENANT = "tgs-org";

function crypto() {
  const svc = new CryptoService({ get: () => HEX } as unknown as ConfigService);
  svc.onModuleInit();
  return svc;
}

describe("maskHint", () => {
  it("enmascara dejando cabeza y cola", () => {
    expect(maskHint("nodo_key_abcdefghijklmnop")).toBe("nodo_ke…mnop");
  });
});

describe("TgsKeysService", () => {
  const prisma = {
    tgsSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const config = { get: jest.fn() };
  const access = { allowedTenantId: jest.fn() };
  const crypt = crypto();

  beforeEach(() => {
    prisma.tgsSettings.findUnique.mockReset();
    prisma.tgsSettings.upsert.mockReset();
    prisma.tgsSettings.deleteMany.mockReset();
    config.get.mockReset();
    access.allowedTenantId.mockReset();
  });

  function service() {
    return new TgsKeysService(
      prisma as never,
      crypt,
      config as never,
      access as unknown as TgsAccessService
    );
  }

  it("sin DB ni env, no hay claves", async () => {
    access.allowedTenantId.mockResolvedValue(TENANT);
    prisma.tgsSettings.findUnique.mockResolvedValue(null);
    config.get.mockReturnValue(undefined);
    const status = await service().status();
    expect(status).toMatchObject({ configured: false, source: "none", keyHint: null });
  });

  it("cae al entorno si no hay fila", async () => {
    access.allowedTenantId.mockResolvedValue(TENANT);
    prisma.tgsSettings.findUnique.mockResolvedValue(null);
    config.get.mockImplementation((key: string) => {
      if (key === "ACUSTOCK_API_KEY") return "nodo_key_from_env_aaaa";
      if (key === "ACUSTOCK_API_SECRET") return "nodo_sec_from_env_bbbb";
      return undefined;
    });
    const status = await service().status();
    expect(status.configured).toBe(true);
    expect(status.source).toBe("env");
    expect(status.keyHint).toContain("…");
  });

  it("guarda cifrado y la DB pisa el entorno", async () => {
    access.allowedTenantId.mockResolvedValue(TENANT);
    config.get.mockImplementation((key: string) => {
      if (key === "ACUSTOCK_API_KEY") return "nodo_key_from_env_aaaa";
      if (key === "ACUSTOCK_API_SECRET") return "nodo_sec_from_env_bbbb";
      return undefined;
    });
    const savedRow: { apiKeyEncrypted?: string; apiSecretEncrypted?: string } = {};
    prisma.tgsSettings.upsert.mockImplementation(async (args: { create: typeof savedRow }) => {
      savedRow.apiKeyEncrypted = args.create.apiKeyEncrypted;
      savedRow.apiSecretEncrypted = args.create.apiSecretEncrypted;
      return args.create;
    });
    prisma.tgsSettings.findUnique.mockImplementation(async () =>
      savedRow.apiKeyEncrypted ? savedRow : null
    );

    const keys = service();
    const saved = await keys.save(TENANT, "user-1", {
      apiKey: "nodo_key_saved_from_ui_xx",
      apiSecret: "nodo_sec_saved_from_ui_yy",
    });
    expect(saved.source).toBe("db");
    expect(saved.keyHint).toBe(maskHint("nodo_key_saved_from_ui_xx"));
    expect(savedRow.apiKeyEncrypted).toBeTruthy();
    expect(savedRow.apiKeyEncrypted).not.toContain("nodo_key_saved");
  });

  it("al borrar vuelve al entorno", async () => {
    access.allowedTenantId.mockResolvedValue(TENANT);
    prisma.tgsSettings.deleteMany.mockResolvedValue({ count: 1 });
    prisma.tgsSettings.findUnique.mockResolvedValue(null);
    config.get.mockImplementation((key: string) => {
      if (key === "ACUSTOCK_API_KEY") return "nodo_key_from_env_aaaa";
      if (key === "ACUSTOCK_API_SECRET") return "nodo_sec_from_env_bbbb";
      return undefined;
    });
    const status = await service().clear(TENANT);
    expect(status.source).toBe("env");
  });
});
