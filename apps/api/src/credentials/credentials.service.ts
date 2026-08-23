import { Injectable, NotFoundException } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import { CryptoService } from "../common/crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import { SaveCredentialDto } from "./dto/save-credential.dto";

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
    await this.visibility.ensureLinked(tenantId, dto.providerName);

    const encrypted = this.crypto.encrypt(JSON.stringify(dto.credentials));
    const row = await this.prisma.credential.upsert({
      where: { tenantId_providerName: { tenantId, providerName: dto.providerName } },
      create: { tenantId, savedById, providerName: dto.providerName, credentialsEncrypted: encrypted },
      update: { credentialsEncrypted: encrypted, savedById },
    });
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
    return { providerName };
  }
}
