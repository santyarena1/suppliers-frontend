import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CryptoService } from "../common/crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";

const SETTINGS_ID = "default";

@Injectable()
export class CatalogSettingsService implements OnModuleInit {
  private readonly logger = new Logger(CatalogSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService
  ) {}

  /** Si hay OPENAI_API_KEY en el entorno y aún no hay clave guardada, la persiste cifrada. */
  async onModuleInit() {
    const envKey = this.config.get<string>("OPENAI_API_KEY")?.trim();
    if (!envKey || envKey.length < 8) return;
    const row = await this.prisma.catalogEnrichmentSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (row?.openAiApiKeyEncrypted) return;
    try {
      await this.saveOpenAiKey(envKey);
      this.logger.log("OpenAI API key inicializada desde OPENAI_API_KEY del entorno");
    } catch (err) {
      this.logger.warn(`No se pudo bootstrap OpenAI key: ${err instanceof Error ? err.message : err}`);
    }
  }

  async hasOpenAiKey() {
    const row = await this.prisma.catalogEnrichmentSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (row?.openAiApiKeyEncrypted) return true;
    return Boolean(this.config.get<string>("OPENAI_API_KEY")?.trim());
  }

  async saveOpenAiKey(apiKey: string) {
    const trimmed = apiKey.trim();
    if (trimmed.length < 8) throw new BadRequestException("La API key de OpenAI es demasiado corta");
    const encrypted = this.crypto.encrypt(trimmed);
    await this.prisma.catalogEnrichmentSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, openAiApiKeyEncrypted: encrypted },
      update: { openAiApiKeyEncrypted: encrypted },
    });
    return { hasOpenAiKey: true };
  }

  async clearOpenAiKey() {
    await this.prisma.catalogEnrichmentSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, openAiApiKeyEncrypted: null },
      update: { openAiApiKeyEncrypted: null },
    });
    return { hasOpenAiKey: Boolean(this.config.get<string>("OPENAI_API_KEY")?.trim()) };
  }

  /**
   * La variable de entorno del deploy manda: es la que administra quien opera la
   * infraestructura y no depende de lo que haya quedado guardado en el panel (una
   * clave vieja ahí no puede tapar a la vigente). Sin variable, se usa la del panel.
   */
  async readOpenAiKey(): Promise<string | null> {
    const env = this.config.get<string>("OPENAI_API_KEY")?.trim();
    if (env && env.length >= 8) return env;
    const row = await this.prisma.catalogEnrichmentSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (row?.openAiApiKeyEncrypted) {
      try {
        return this.crypto.decrypt(row.openAiApiKeyEncrypted);
      } catch {
        throw new BadRequestException("No se pudo leer la API key de OpenAI. Volvé a guardarla.");
      }
    }
    return null;
  }
}
