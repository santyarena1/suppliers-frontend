import { Reflector } from "@nestjs/core";
import { ApiError } from "../core/api-error";
import { hashSecret, newPublicKey, newSecret, readCredentials, secretMatches } from "./api-key-crypto";
import { ApiClientResolver } from "./api-client-resolver.service";
import { ApiKeyGuard } from "./api-key.guard";
import { API_SCOPES_KEY } from "./api-principal";
import { ipAllowed, isValidAllowlistEntry } from "./ip-allowlist";
import { FixedWindowLimiter } from "./rate-limiter";

const PEPPER = "x".repeat(40);

describe("credenciales", () => {
  it("el hash del secret se verifica en tiempo constante y no matchea otro", () => {
    const secret = newSecret();
    const hash = hashSecret(secret, PEPPER);
    expect(secretMatches(secret, hash, PEPPER)).toBe(true);
    expect(secretMatches(`${secret}x`, hash, PEPPER)).toBe(false);
    expect(secretMatches(secret, hash, "y".repeat(40))).toBe(false);
    expect(secretMatches(secret, null, PEPPER)).toBe(false);
  });

  it("formatos de key y secret", () => {
    expect(newPublicKey()).toMatch(/^nodo_pk_[0-9A-Za-z]{20,}$/);
    expect(newSecret()).toMatch(/^nodo_sk_[0-9A-Za-z]{28,}$/);
  });

  it("lee headers propios o HTTP Basic", () => {
    expect(readCredentials({ "x-api-key": "k", "x-api-secret": "s" })).toEqual({ key: "k", secret: "s" });
    const basic = Buffer.from("nodo_pk_a:nodo_sk_b").toString("base64");
    expect(readCredentials({ authorization: `Basic ${basic}` })).toEqual({ key: "nodo_pk_a", secret: "nodo_sk_b" });
    expect(readCredentials({ authorization: "Bearer xyz" })).toBeNull();
    expect(readCredentials({})).toBeNull();
  });
});

describe("IPs permitidas", () => {
  it("IPs sueltas y rangos CIDR v4 y v6", () => {
    expect(ipAllowed("1.2.3.4", [])).toBe(true);
    expect(ipAllowed("10.1.2.3", ["10.0.0.0/8"])).toBe(true);
    expect(ipAllowed("11.1.2.3", ["10.0.0.0/8"])).toBe(false);
    expect(ipAllowed("::ffff:10.1.2.3", ["10.0.0.0/8"])).toBe(true);
    expect(ipAllowed("2001:db8::1", ["2001:db8::/32"])).toBe(true);
    expect(ipAllowed("2001:db9::1", ["2001:db8::/32"])).toBe(false);
    expect(ipAllowed("200.1.1.1", ["200.1.1.1"])).toBe(true);
  });

  it("valida las entradas", () => {
    expect(isValidAllowlistEntry("10.0.0.0/8")).toBe(true);
    expect(isValidAllowlistEntry("10.0.0.0/33")).toBe(false);
    expect(isValidAllowlistEntry("hola")).toBe(false);
    expect(isValidAllowlistEntry("::1")).toBe(true);
  });
});

describe("límite por minuto", () => {
  it("corta al pasarse y se renueva con la ventana", () => {
    const limiter = new FixedWindowLimiter(60_000);
    expect(limiter.hit("k", 2, 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.hit("k", 2, 1)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.hit("k", 2, 2)).toMatchObject({ allowed: false, remaining: 0, resetSeconds: 60 });
    expect(limiter.hit("k", 2, 60_001)).toMatchObject({ allowed: true, remaining: 1 });
  });
});

function clientRow(patch: Record<string, unknown> = {}, tenant: Record<string, unknown> = {}, sub: Record<string, unknown> | null = {}) {
  return {
    id: "c1",
    name: "Tienda",
    publicKey: "nodo_pk_AAAAAAAAAAAAAAAAAAAA",
    secretHash: hashSecret("nodo_sk_bueno"),
    previousSecretHash: null,
    previousSecretExpiresAt: null,
    feedToken: "nodo_ft_AAAAAAAAAAAAAAAAAAAA",
    status: "ACTIVE",
    config: {},
    scopes: ["catalog:read"],
    ipAllowlist: [],
    rateLimitPerMinute: 120,
    expiresAt: null,
    createdAt: new Date(),
    ...patch,
    tenant: {
      id: "t1",
      name: "Comercio",
      type: "RETAILER",
      plan: "PRO",
      active: true,
      mirrorsCommercialFromId: null,
      subscription:
        sub === null
          ? null
          : {
              status: "ACTIVE",
              currentPeriodEnd: null,
              nextBillingAt: new Date(Date.now() + 10 * 86_400_000),
              gracePeriodEnd: null,
              trialEndsAt: null,
              courtesyUntil: null,
              suspensionReason: null,
              setupFeeStatus: "NOT_APPLICABLE",
              setupFeeBlocksCustom: false,
              catalogApiAddon: true,
              ...sub,
            },
      ...tenant,
    },
  };
}

function resolverWith(row: unknown) {
  const prisma = { apiClient: { findUnique: jest.fn().mockResolvedValue(row) } };
  return new ApiClientResolver(prisma as never);
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (err) {
    return (err as ApiError).code;
  }
}

describe("validación de la key", () => {
  const key = "nodo_pk_AAAAAAAAAAAAAAAAAAAA";

  it("key, secret, módulo y suscripción en orden", async () => {
    expect(await codeOf(resolverWith(clientRow()).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", "catalog:read"))).toBe("ok");
    expect(await codeOf(resolverWith(clientRow()).byCredentials(key, "nodo_sk_malo", "1.1.1.1", null))).toBe("invalid_credentials");
    expect(await codeOf(resolverWith(null).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("invalid_credentials");
    expect(await codeOf(resolverWith(clientRow()).byCredentials("otra-cosa", "x", "1.1.1.1", null))).toBe("invalid_credentials");
    expect(await codeOf(resolverWith(clientRow({ status: "REVOKED" })).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("key_revoked");
    expect(await codeOf(resolverWith(clientRow({ expiresAt: new Date(Date.now() - 1000) })).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("key_expired");
    expect(await codeOf(resolverWith(clientRow({ ipAllowlist: ["10.0.0.0/8"] })).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("ip_not_allowed");
    expect(await codeOf(resolverWith(clientRow()).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", "webhooks:manage"))).toBe("insufficient_scope");
    expect(await codeOf(resolverWith(clientRow({}, {}, { catalogApiAddon: false })).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("addon_required");
    expect(await codeOf(resolverWith(clientRow({}, {}, { status: "SUSPENDED", suspensionReason: "MANUAL" })).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("subscription_suspended");
    expect(await codeOf(resolverWith(clientRow({}, { active: false })).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("invalid_credentials");
  });

  it("Custom trae la API incluida sin módulo", async () => {
    const row = clientRow({}, { plan: "CUSTOM" }, { catalogApiAddon: false });
    expect(await codeOf(resolverWith(row).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("ok");
  });

  it("el secret anterior vale 24 h después de rotar", async () => {
    const rotated = clientRow({
      secretHash: hashSecret("nodo_sk_nuevo"),
      previousSecretHash: hashSecret("nodo_sk_bueno"),
      previousSecretExpiresAt: new Date(Date.now() + 3_600_000),
    });
    expect(await codeOf(resolverWith(rotated).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("ok");
    const expired = clientRow({ ...rotated, previousSecretExpiresAt: new Date(Date.now() - 1000) });
    expect(await codeOf(resolverWith(expired).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null))).toBe("invalid_credentials");
  });

  it("organizaciones espejo leen el catálogo de la otra", async () => {
    const row = clientRow({}, { mirrorsCommercialFromId: "t-origen" });
    const principal = await resolverWith(row).byCredentials(key, "nodo_sk_bueno", "1.1.1.1", null);
    expect(principal.catalogTenantId).toBe("t-origen");
    expect(principal.tenantId).toBe("t1");
  });
});

describe("ApiKeyGuard", () => {
  function ctx(headers: Record<string, string>, scopes?: string[]) {
    const replyHeaders: Record<string, string> = {};
    const request = { headers, ip: "1.1.1.1" } as Record<string, unknown>;
    const reply = { header: (k: string, v: string) => (replyHeaders[k] = v) };
    const reflector = { getAllAndOverride: (k: string) => (k === API_SCOPES_KEY ? scopes : undefined) } as unknown as Reflector;
    const context = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
      getHandler: () => null,
      getClass: () => null,
    };
    return { context: context as never, request, replyHeaders, reflector };
  }

  it("sin credenciales: missing_credentials; con credenciales: headers de límite y request id", async () => {
    const resolver = { byCredentials: jest.fn().mockResolvedValue({ clientId: "c1", rateLimitPerMinute: 1, scopes: ["catalog:read"] }) };
    const empty = ctx({});
    const guard = new ApiKeyGuard(resolver as never, empty.reflector);
    await expect(guard.canActivate(empty.context)).rejects.toMatchObject({ code: "missing_credentials" });
    expect(empty.replyHeaders["X-Request-Id"]).toMatch(/^req_/);

    const ok = ctx({ "x-api-key": "k", "x-api-secret": "s" });
    await expect(guard.canActivate(ok.context)).resolves.toBe(true);
    expect(ok.replyHeaders["X-RateLimit-Limit"]).toBe("1");
    expect(ok.replyHeaders["X-RateLimit-Remaining"]).toBe("0");
    const again = ctx({ "x-api-key": "k", "x-api-secret": "s" });
    await expect(guard.canActivate(again.context)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("muchas credenciales inválidas desde la misma IP terminan en 429", async () => {
    const resolver = { byCredentials: jest.fn().mockRejectedValue(new ApiError(401, "invalid_credentials", "x")) };
    const probe = ctx({ "x-api-key": "k", "x-api-secret": "s" });
    const guard = new ApiKeyGuard(resolver as never, probe.reflector);
    let last = "";
    for (let i = 0; i < 31; i++) {
      last = await guard.canActivate(ctx({ "x-api-key": "k", "x-api-secret": "s" }).context).catch((e) => e.code);
    }
    expect(last).toBe("rate_limited");
  });
});
