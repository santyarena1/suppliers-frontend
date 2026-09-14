import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Foto del carrito del portal de un distribuidor tal como NODO lo dejó en la
 * última verificación (`{ codigo: cantidad }`), por comercio y proveedor.
 * Contra la foto se sabe qué cambió de cada lado — ver portal-cart-sync.ts.
 */
@Injectable()
export class PortalCartSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async load(tenantId: string, provider: string): Promise<Record<string, number> | null> {
    const row = await this.prisma.providerSyncConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
      select: { portalCartSnapshot: true },
    });
    const snap = row?.portalCartSnapshot;
    if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
    const out: Record<string, number> = {};
    for (const [code, qty] of Object.entries(snap as Record<string, unknown>)) {
      if (typeof qty === "number" && Number.isFinite(qty)) out[code] = qty;
    }
    return out;
  }

  async save(tenantId: string, provider: string, snapshot: Record<string, number> | null) {
    await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, portalCartSnapshot: snapshot ?? undefined, portalCartSyncedAt: new Date() },
      update: { portalCartSnapshot: snapshot ?? Prisma.DbNull, portalCartSyncedAt: new Date() },
    });
  }

  /** Después de confirmar un pedido el portal se llevó el carrito: la foto ya no describe nada. */
  async clear(tenantId: string, provider: string) {
    await this.save(tenantId, provider, null);
  }
}
