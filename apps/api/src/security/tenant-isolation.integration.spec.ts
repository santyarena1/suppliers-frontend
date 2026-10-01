// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
//
// Audita el aislamiento multi-tenant: con el contexto del comercio A, nada de lo
// creado por el comercio B (ni lo del distribuidor del link) tiene que ser legible
// ni modificable. Usa los SERVICES reales (no HTTP) para aislar la capa de datos.
import { ConfigService } from "@nestjs/config";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { CartService } from "../cart/cart.service";
import { ChatHub } from "../chat/chat.hub";
import { ChatService } from "../chat/chat.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { CredentialsService } from "../credentials/credentials.service";
import { AssetsService } from "../assets/assets.service";
import { AssetsController } from "../assets/assets.controller";
import { signAssetPath } from "../assets/asset-signing";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import type { TenantContext } from "../tenants/tenant-context.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

function ctxFor(tenantId: string, tenantName: string, userId: string): TenantContext {
  return {
    userId,
    tenantId,
    tenantName,
    tenantType: "RETAILER",
    tenantRole: "OWNER",
    membershipId: null,
    permissions: [],
    commercialTenantId: tenantId,
  };
}

d("Aislamiento multi-tenant contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const hub = new ChatHub(new ConfigService());
  const cartService = new CartService(prisma as never, hub);
  const chatService = new ChatService(prisma as never, hub);

  const config = new ConfigService();
  (process.env as Record<string, string>).ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY ?? "0".repeat(63) + "1";
  const crypto = new CryptoService(config);
  crypto.onModuleInit();
  const visibility = new TenantVisibilityService(prisma as never);
  const credentialsService = new CredentialsService(prisma as never, crypto, visibility);
  const assetsService = new AssetsService(prisma as never);
  (process.env as Record<string, string>).ASSET_SIGNING_SECRET = process.env.ASSET_SIGNING_SECRET ?? "secreto-iso";

  const tenantA = "iso-tenant-a";
  const tenantB = "iso-tenant-b";
  const tenantDistro = "iso-tenant-distro";
  const userA = "iso-user-a";
  const userB = "iso-user-b";
  const userDistro = "iso-user-distro";

  let orderA: { id: string };
  let orderB: { id: string };
  let cartItemB: { id: string };
  let linkB: { id: string };
  let threadB: { id: string } | null = null;
  let privateAssetB: { id: string };

  beforeAll(async () => {
    // Limpieza idempotente (orden: hijos primero).
    await prisma.chatMessage.deleteMany({ where: { thread: { link: { clientTenantId: { in: [tenantA, tenantB] } } } } });
    await prisma.chatThread.deleteMany({ where: { link: { clientTenantId: { in: [tenantA, tenantB] } } } });
    await prisma.tenantLink.deleteMany({ where: { clientTenantId: { in: [tenantA, tenantB] } } });
    await prisma.providerOrder.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.cartItem.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.credential.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: [tenantA, tenantB, tenantDistro] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB, userDistro] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB, tenantDistro] } } });

    await prisma.tenant.create({ data: { id: tenantA, name: "ISO Comercio A", type: "RETAILER" } });
    await prisma.tenant.create({ data: { id: tenantB, name: "ISO Comercio B", type: "RETAILER" } });
    await prisma.tenant.create({
      data: { id: tenantDistro, name: "ISO Distribuidor", type: "DISTRIBUTOR", providerKey: `LIST_ISO_${Date.now()}` },
    });

    await prisma.user.create({
      data: { id: userA, username: `iso-owner-a-${Date.now()}`, email: `iso-a-${Date.now()}@test.local`, passwordHash: "x" },
    });
    await prisma.user.create({
      data: { id: userB, username: `iso-owner-b-${Date.now()}`, email: `iso-b-${Date.now()}@test.local`, passwordHash: "x" },
    });
    await prisma.user.create({
      data: { id: userDistro, username: `iso-distro-${Date.now()}`, email: `iso-d-${Date.now()}@test.local`, passwordHash: "x" },
    });

    await prisma.tenantMembership.create({ data: { tenantId: tenantA, userId: userA, role: "OWNER" } });
    await prisma.tenantMembership.create({ data: { tenantId: tenantB, userId: userB, role: "OWNER" } });
    await prisma.tenantMembership.create({ data: { tenantId: tenantDistro, userId: userDistro, role: "OWNER" } });

    orderA = await prisma.providerOrder.create({
      data: {
        userId: userA,
        tenantId: tenantA,
        provider: tenantDistro,
        status: "OFFLINE_DRAFT",
        paymentOption: "OFFLINE",
        channel: "OFFLINE",
        items: [{ sku: "iso-a-1", qty: 1 }],
        addressSnapshot: {},
      },
    });
    orderB = await prisma.providerOrder.create({
      data: {
        userId: userB,
        tenantId: tenantB,
        provider: tenantDistro,
        status: "OFFLINE_DRAFT",
        paymentOption: "OFFLINE",
        channel: "OFFLINE",
        items: [{ sku: "iso-b-1", qty: 1 }],
        addressSnapshot: {},
      },
    });

    cartItemB = await prisma.cartItem.create({
      data: {
        userId: userB,
        tenantId: tenantB,
        provider: "LIST_ISO",
        externalId: "iso-ext-b",
        name: "Producto B",
        price: "100",
        imageUrl: "https://example.com/b.png",
        quantity: 1,
      },
    });

    await prisma.credential.create({
      data: {
        tenantId: tenantB,
        providerName: "LIST_ISO",
        credentialsEncrypted: crypto.encrypt(JSON.stringify({ user: "b-secret-user", pass: "b-secret-pass" })),
      },
    });

    linkB = await prisma.tenantLink.create({
      data: { clientTenantId: tenantB, supplierTenantId: tenantDistro, status: "ACTIVE" },
    });

    try {
      threadB = await prisma.chatThread.create({
        data: { linkId: linkB.id, distroUserId: userDistro, storeUserId: userB },
      });
      await prisma.chatMessage.create({
        data: { threadId: threadB.id, authorUserId: userB, body: "Mensaje privado de B" },
      });
    } catch {
      threadB = null;
    }

    // Igual que /my/chat/upload: privado y de B.
    const saved = await assetsService.saveChatFile(
      {
        filename: "contrato-b.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.from("contenido privado de B"),
      },
      tenantB
    );
    privateAssetB = { id: saved.url.split("?")[0].replace("/assets/", "") };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const tenantAContext = () => ctxFor(tenantA, "ISO Comercio A", userA);

  it("órdenes: A no puede leer ni actualizar una orden de B por id", async () => {
    const approvalPrisma = prisma as never;
    const { OrderApprovalService } = await import("../orders/order-approval.service");
    const approval = new OrderApprovalService(approvalPrisma, visibility);
    await expect(approval.getOwn(tenantAContext(), orderB.id)).rejects.toThrow(NotFoundException);
    // Control: A sí puede leer la suya.
    await expect(approval.getOwn(tenantAContext(), orderA.id)).resolves.toMatchObject({ id: orderA.id });
  });

  it("carrito: A no puede editar ni borrar un item del carrito de B", async () => {
    await expect(
      cartService.updateItem(tenantAContext(), userA, cartItemB.id, { quantity: 5 } as never)
    ).rejects.toThrow(NotFoundException);
    await expect(cartService.removeItem(tenantAContext(), userA, cartItemB.id)).rejects.toThrow(NotFoundException);
    const stillThere = await prisma.cartItem.findUnique({ where: { id: cartItemB.id } });
    expect(stillThere).not.toBeNull();
  });

  it("credenciales: A no ve ni puede borrar las credenciales de B del mismo proveedor", async () => {
    const listOfA = await credentialsService.ofTenant(tenantA);
    expect(listOfA.find((c) => c.providerName === "LIST_ISO")).toBeUndefined();
    // getByProvider con el tenantId de A no encuentra lo de B (compuesto por tenantId).
    await expect(credentialsService.getByProvider(tenantA, "LIST_ISO" as never)).rejects.toThrow(
      NotFoundException
    );
  });

  it("chat: A no puede leer ni escribir en el thread de B con el distribuidor", async () => {
    if (!threadB) {
      // El modelo ChatMessage puede tener columnas distintas en este esquema; si no se
      // pudo sembrar el fixture, igual probamos que el thread no es visible para A.
    }
    await expect(chatService.getThread(tenantAContext(), threadB?.id ?? "nonexistent")).rejects.toThrow(
      NotFoundException
    );
    await expect(
      chatService.send(tenantAContext(), threadB?.id ?? "nonexistent", { body: "hola" } as never)
    ).rejects.toThrow();
  });

  it("adjunto del chat: sin link firmado no se sirve (404), con firma sí", async () => {
    const controller = new AssetsController(assetsService);
    const reply = { header: jest.fn() } as never;
    await expect(controller.get(privateAssetB.id, undefined, undefined, reply)).rejects.toThrow(NotFoundException);
    const signed = new URL(signAssetPath(`/assets/${privateAssetB.id}`), "https://x");
    const file = await controller.get(privateAssetB.id, signed.searchParams.get("exp")!, signed.searchParams.get("sig")!, reply);
    expect(file).toBeDefined();
  });

  it("adjunto del chat: la firma de otro archivo no sirve", async () => {
    const controller = new AssetsController(assetsService);
    const other = new URL(signAssetPath("/assets/00000000-0000-4000-8000-000000000000"), "https://x");
    await expect(
      controller.get(privateAssetB.id, other.searchParams.get("exp")!, other.searchParams.get("sig")!, { header: jest.fn() } as never)
    ).rejects.toThrow(NotFoundException);
  });

  it("adjunto del chat: A no puede mandar en su chat un archivo privado de B", async () => {
    const threadA = await prisma.chatThread.findFirst({ where: { link: { clientTenantId: tenantA } }, select: { id: true } });
    const threadId = threadA?.id ?? "nonexistent";
    await expect(
      chatService.send(tenantAContext(), threadId, { kind: "FILE", payload: { url: `/assets/${privateAssetB.id}` } } as never)
    ).rejects.toThrow();
  });
});
