import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TgsKeysStatus, TgsKeysSource } from "@nodo/shared";
import { CryptoService } from "../common/crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_ACUSTOCK_BASE } from "./tgs.constants";
import { TgsAccessService } from "./tgs.access";

export interface TgsResolvedKeys {
  key: string;
  secret: string;
  baseUrl: string;
  source: Exclude<TgsKeysSource, "none">;
}

const CACHE_MS = 15_000;

@Injectable()
export class TgsKeysService {
  private cache: { value: TgsResolvedKeys | null; expires: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly access: TgsAccessService
  ) {}

  async status(): Promise<TgsKeysStatus> {
    const resolved = await this.resolve();
    if (!resolved) {
      return {
        configured: false,
        source: "none",
        keyHint: null,
        secretConfigured: false,
        baseUrl: this.defaultBaseUrl(),
      };
    }
    return {
      configured: true,
      source: resolved.source,
      keyHint: maskHint(resolved.key),
      secretConfigured: true,
      baseUrl: resolved.baseUrl,
    };
  }

  async save(tenantId: string, savedById: string, dto: { apiKey: string; apiSecret: string; baseUrl?: string }): Promise<TgsKeysStatus> {
    const apiKey = dto.apiKey.trim();
    const apiSecret = dto.apiSecret.trim();
    if (apiKey.length < 12) throw new BadRequestException("La API key es demasiado corta.");
    if (apiSecret.length < 12) throw new BadRequestException("El API secret es demasiado corto.");
    const baseUrl = normalizeBaseUrl(dto.baseUrl);
    await this.prisma.tgsSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        savedById,
        apiKeyEncrypted: this.crypto.encrypt(apiKey),
        apiSecretEncrypted: this.crypto.encrypt(apiSecret),
        baseUrl,
      },
      update: {
        savedById,
        apiKeyEncrypted: this.crypto.encrypt(apiKey),
        apiSecretEncrypted: this.crypto.encrypt(apiSecret),
        baseUrl,
      },
    });
    this.invalidate();
    return this.status();
  }

  async clear(tenantId: string): Promise<TgsKeysStatus> {
    await this.prisma.tgsSettings.deleteMany({ where: { tenantId } });
    this.invalidate();
    return this.status();
  }

  async resolve(): Promise<TgsResolvedKeys | null> {
    const now = Date.now();
    if (this.cache && this.cache.expires > now) return this.cache.value;
    const value = await this.load();
    this.cache = { value, expires: now + CACHE_MS };
    return value;
  }

  invalidate() {
    this.cache = null;
  }

  private async load(): Promise<TgsResolvedKeys | null> {
    const tenantId = await this.access.allowedTenantId();
    if (tenantId) {
      const row = await this.prisma.tgsSettings.findUnique({ where: { tenantId } });
      if (row?.apiKeyEncrypted && row?.apiSecretEncrypted) {
        try {
          return {
            key: this.crypto.decrypt(row.apiKeyEncrypted),
            secret: this.crypto.decrypt(row.apiSecretEncrypted),
            baseUrl: normalizeBaseUrl(row.baseUrl) ?? this.defaultBaseUrl(),
            source: "db",
          };
        } catch {
          throw new BadRequestException("No se pudieron leer las claves de AcuStock. Volvé a guardarlas.");
        }
      }
    }
    return this.fromEnv();
  }

  private fromEnv(): TgsResolvedKeys | null {
    const key = (this.config.get<string>("ACUSTOCK_API_KEY") || "").trim();
    const secret = (this.config.get<string>("ACUSTOCK_API_SECRET") || "").trim();
    if (!key || !secret) return null;
    return { key, secret, baseUrl: this.defaultBaseUrl(), source: "env" };
  }

  private defaultBaseUrl() {
    return (this.config.get<string>("ACUSTOCK_BASE_URL") || DEFAULT_ACUSTOCK_BASE).replace(/\/$/, "");
  }
}

export function maskHint(value: string): string {
  const t = value.trim();
  if (t.length <= 10) return "••••";
  return `${t.slice(0, 7)}…${t.slice(-4)}`;
}

export function normalizeBaseUrl(value?: string | null): string | undefined {
  const t = value?.trim();
  if (!t) return undefined;
  return t.replace(/\/$/, "");
}
