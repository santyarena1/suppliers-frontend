import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { isDemoDistributorKey } from "../onboarding/onboarding-demo";
import { providerHasCatalogAdapter, type Provider } from "@nodo/shared";
import { CryptoService } from "../common/crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import { SaveCredentialDto } from "./dto/save-credential.dto";
import { cleanCredentialValues } from "./credential-values";

/**
 * Las credenciales son de la organización, no de la persona que las cargó: la
 * cuenta en el distribuidor la abrió el comercio. `savedById` queda solo como
 * rastro de quién la tocó por última vez.
 */
@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly visibility: TenantVisibilityService
  ) {}

  async ofTenant(tenantId: string) {
    const rows = await this.prisma.credential.findMany({ where: { tenantId } });
    return rows.map((row) => ({
      providerName: row.providerName as Provider,
      credentialsJson: this.crypto.decrypt(row.credentialsEncrypted),
    }));
  }

  async getByProvider(tenantId: string, providerName: Provider) {
    const row = await this.prisma.credential.findUnique({
      where: { tenantId_providerName: { tenantId, providerName } },
    });
    if (!row) throw new NotFoundException("No hay credencial guardada para este proveedor");
    return { providerName, credentialsJson: this.crypto.decrypt(row.credentialsEncrypted) };
  }

  /** `null` en vez de excepción, para los lugares que solo quieren saber si hay. */
  async findByProvider(tenantId: string, providerName: Provider) {
    const row = await this.prisma.credential.findUnique({
      where: { tenantId_providerName: { tenantId, providerName } },
    });
    return row ? { providerName, credentialsJson: this.crypto.decrypt(row.credentialsEncrypted) } : null;
  }

  async save(tenantId: string, savedById: string, dto: SaveCredentialDto) {
    // No se puede cargar la cuenta de un distribuidor que para este comercio no
    // existe. Si lo descubrió por publicidad, cargarla lo deja vinculado.
    if (isDemoDistributorKey(dto.providerName)) {
      throw new BadRequestException("Es un distribuidor de ejemplo: no lleva cuenta. Cargá la de tus distribuidores reales.");
    }
    const values = cleanCredentialValues(dto.credentials);
    await this.visibility.ensureLinked(tenantId, dto.providerName);

    const encrypted = this.crypto.encrypt(JSON.stringify(values));
    const row = await this.prisma.credential.upsert({
      where: { tenantId_providerName: { tenantId, providerName: dto.providerName } },
      create: { tenantId, savedById, providerName: dto.providerName, credentialsEncrypted: encrypted },
      update: { credentialsEncrypted: encrypted, savedById },
    });
    // Con cuenta propia, los precios llegan por API. Si antes se conectó por lista,
    // el canal quedaba en LIST y ni la sincronización la tomaba. Solo si hay
    // integración: Ashir, GC o HDC siguen por lista aunque guarden una cuenta.
    if (providerHasCatalogAdapter(dto.providerName)) {
      await this.prisma.providerSyncConfig.updateMany({
        where: { tenantId, provider: dto.providerName, priceChannel: { not: "API" } },
        data: { priceChannel: "API" },
      });
      // Por defecto la sincronización automática queda prendida cada 1 h. Solo la
      // primera vez (nunca sincronizó): si después la apagó, se respeta.
      const config = await this.prisma.providerSyncConfig.findUnique({
        where: { tenantId_provider: { tenantId, provider: dto.providerName } },
        select: { lastSyncedAt: true, enabled: true },
      });
      if (!config) {
        await this.prisma.providerSyncConfig.create({
          data: { tenantId, provider: dto.providerName, priceChannel: "API", enabled: true, syncIntervalMinutes: 60 },
        });
      } else if (!config.lastSyncedAt && !config.enabled) {
        await this.prisma.providerSyncConfig.update({
          where: { tenantId_provider: { tenantId, provider: dto.providerName } },
          data: { enabled: true, syncIntervalMinutes: 60 },
        });
      }
      // Cuenta nueva o corregida: se levanta la pausa por fallos y se vuelve a intentar.
      await this.prisma.providerSyncConfig.updateMany({
        where: { tenantId, provider: dto.providerName },
        data: { pausedAt: null, pauseReason: null, consecutiveFailures: 0 },
      });
    }
    return {
      providerName: row.providerName as Provider,
      credentialsJson: this.crypto.decrypt(row.credentialsEncrypted),
    };
  }

  async delete(tenantId: string, providerName: Provider) {
    await this.prisma.credential
      .delete({ where: { tenantId_providerName: { tenantId, providerName } } })
      .catch(() => {
        throw new NotFoundException("No hay credencial guardada para este proveedor");
      });
    // Sin cuenta, los precios que trajo dejan de actualizarse: se dejan de mostrar.
    // Una lista propia de ese proveedor (canal LIST) no depende de la cuenta y queda.
    if (providerHasCatalogAdapter(providerName)) {
      const config = await this.prisma.providerSyncConfig.findUnique({
        where: { tenantId_provider: { tenantId, provider: providerName } },
        select: { priceChannel: true },
      });
      if ((config?.priceChannel ?? "API") === "API") {
        await this.prisma.tenantProductOffer.updateMany({
          where: { tenantId, provider: providerName, active: true },
          data: { active: false },
        });
      }
    }
    return { providerName };
  }
}
