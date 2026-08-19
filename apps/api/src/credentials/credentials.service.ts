import { Injectable, NotFoundException } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import { CryptoService } from "../common/crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { SaveCredentialDto } from "./dto/save-credential.dto";

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService
  ) {}

  async mine(userId: string) {
    const rows = await this.prisma.credential.findMany({ where: { userId } });
    return rows.map((row) => ({
      providerName: row.providerName as Provider,
      credentialsJson: this.crypto.decrypt(row.credentialsEncrypted),
    }));
  }

  async getByProvider(userId: string, providerName: Provider) {
    const row = await this.prisma.credential.findUnique({
      where: { userId_providerName: { userId, providerName } },
    });
    if (!row) throw new NotFoundException("No hay credencial guardada para este proveedor");
    return { providerName, credentialsJson: this.crypto.decrypt(row.credentialsEncrypted) };
  }

  async save(userId: string, dto: SaveCredentialDto) {
    const encrypted = this.crypto.encrypt(JSON.stringify(dto.credentials));
    const row = await this.prisma.credential.upsert({
      where: { userId_providerName: { userId, providerName: dto.providerName } },
      create: { userId, providerName: dto.providerName, credentialsEncrypted: encrypted },
      update: { credentialsEncrypted: encrypted },
    });
    return { providerName: row.providerName as Provider, credentialsJson: this.crypto.decrypt(row.credentialsEncrypted) };
  }

  async delete(userId: string, providerName: Provider) {
    await this.prisma.credential
      .delete({ where: { userId_providerName: { userId, providerName } } })
      .catch(() => {
        throw new NotFoundException("No hay credencial guardada para este proveedor");
      });
    return { providerName };
  }
}
