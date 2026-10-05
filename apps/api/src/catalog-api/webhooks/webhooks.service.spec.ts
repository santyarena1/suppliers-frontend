import { WebhooksService } from "./webhooks.service";
import { postWebhook } from "./webhook-http";

jest.mock("./webhook-http", () => ({ postWebhook: jest.fn() }));
const post = postWebhook as jest.MockedFunction<typeof postWebhook>;

function setup(endpointPatch: Record<string, unknown> = {}) {
  const endpoint = {
    id: "w1",
    apiClientId: "c1",
    url: "https://ejemplo.com/hook",
    secretEncrypted: "cifrado",
    events: ["price.changed"],
    active: true,
    cursor: 10n,
    consecutiveFailures: 0,
    disabledAt: null,
    disabledReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...endpointPatch,
  };
  const delivery = {
    id: "d1",
    endpointId: "w1",
    eventId: "evt_1",
    type: "catalog.changes",
    payload: { a: 1 },
    status: "PENDING",
    attempts: 0,
    nextAttemptAt: new Date(0),
    lastStatusCode: null,
    lastError: null,
    deliveredAt: null,
    createdAt: new Date(),
    endpoint,
  };
  const updates: { delivery: Record<string, unknown>[]; endpoint: Record<string, unknown>[] } = { delivery: [], endpoint: [] };
  const notifications: unknown[] = [];
  const prisma = {
    apiWebhookDelivery: {
      findMany: jest.fn().mockResolvedValue([delivery]),
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        updates.delivery.push(args.data);
        return { ...delivery, ...args.data };
      }),
    },
    apiWebhookEndpoint: {
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        updates.endpoint.push(args.data);
        return { ...endpoint, ...args.data };
      }),
    },
    apiClient: { findUnique: jest.fn().mockResolvedValue({ tenantId: "t1", name: "Tienda" }) },
    orgNotification: { create: jest.fn((args: unknown) => (notifications.push(args), Promise.resolve(args))) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const crypto = { decrypt: () => "whsec_x", encrypt: (s: string) => s };
  const service = new WebhooksService(prisma as never, crypto as never, {} as never, {} as never);
  return { service, updates, notifications };
}

describe("entregas de webhooks", () => {
  beforeEach(() => post.mockReset());

  it("2xx: entregada y se reinicia el contador de fallos", async () => {
    post.mockResolvedValue({ ok: true, status: 200, error: null });
    const { service, updates } = setup({ consecutiveFailures: 5 });
    await service.deliverDue(new Date(1_000));
    expect(updates.delivery[0]).toMatchObject({ status: "DELIVERED", attempts: 1, lastStatusCode: 200 });
    expect(updates.endpoint[0]).toEqual({ consecutiveFailures: 0 });
  });

  it("falla: queda pendiente con el próximo intento en 1 minuto", async () => {
    post.mockResolvedValue({ ok: false, status: 500, error: "HTTP 500: boom" });
    const { service, updates } = setup();
    await service.deliverDue(new Date(1_000));
    expect(updates.delivery[0]).toMatchObject({ status: "PENDING", attempts: 1, lastError: "HTTP 500: boom" });
    expect((updates.delivery[0].nextAttemptAt as Date).getTime()).toBe(61_000);
    expect(updates.endpoint[0]).toEqual({ consecutiveFailures: 1 });
  });

  it("a los 20 fallos seguidos se apaga y avisa al comercio", async () => {
    post.mockResolvedValue({ ok: false, status: null, error: "Tiempo de espera agotado (10 s)" });
    const { service, updates, notifications } = setup({ consecutiveFailures: 19 });
    await service.deliverDue(new Date(1_000));
    expect(updates.endpoint[0]).toMatchObject({ consecutiveFailures: 20, disabledAt: new Date(1_000) });
    expect(String(updates.endpoint[0].disabledReason)).toContain("20 entregas fallidas");
    expect(notifications).toHaveLength(1);
  });
});
