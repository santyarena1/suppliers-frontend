import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import axios from "axios";
import { PrismaService } from "../prisma/prisma.service";

const HG_LOGO = (slug: string) =>
  `https://www.hardgamers.com.ar/public/images/country/ar/stores/${encodeURIComponent(slug)}/logo.png`;
const FAVICON = (domain: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
/** Hosts que no son del local: el agregador, CDNs genéricos. */
const NOT_THE_STORE = /(^|\.)(hardgamers\.com\.ar|cloudfront\.net|amazonaws\.com|googleusercontent\.com|cloudinary\.com|imgix\.net|vtexassets\.com|mlstatic\.com)$/i;
const RETRY_MS = 24 * 60 * 60_000;
/** Dominio conocido de locales que no publican productos con link a su web. */
const KNOWN_DOMAINS: Record<string, string> = { compragamer: "compragamer.com" };

/** Dominio del local a partir de las URLs de sus productos (link o imagen). */
export function storeDomainFrom(urls: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const u of urls) {
    if (!u) continue;
    let host: string;
    try {
      host = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    if (!host || NOT_THE_STORE.test(host)) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Logo para los locales que no traen uno de su fuente: primero el que publica
 * HardGamers para ese local, si no el ícono de su web. Cada local se reintenta
 * una vez por día como mucho.
 */
@Injectable()
export class RetailLogosService {
  private readonly logger = new Logger(RetailLogosService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron("45 * * * *")
  async fillMissing(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let filled = 0;
    try {
      const stores = await this.prisma.retailStore.findMany({
        where: { logoUrl: null, active: true },
        select: { id: true, name: true, raw: true },
      });
      for (const store of stores) {
        const raw = store.raw && typeof store.raw === "object" ? (store.raw as Record<string, unknown>) : {};
        const tried = typeof raw.logoTriedAt === "string" ? Date.parse(raw.logoTriedAt) : 0;
        if (tried && Date.now() - tried < RETRY_MS) continue;

        const logo = await this.findLogo(store.id, raw).catch(() => null);
        await this.prisma.retailStore.update({
          where: { id: store.id },
          data: logo ? { logoUrl: logo } : { raw: { ...raw, logoTriedAt: new Date().toISOString() } as object },
        });
        if (logo) filled += 1;
      }
      if (filled) this.logger.log(`Logos de locales: ${filled} nuevos`);
    } finally {
      this.running = false;
    }
    return filled;
  }

  private async findLogo(storeId: string, raw: Record<string, unknown>): Promise<string | null> {
    const source = typeof raw.source === "string" ? raw.source : "";
    const slug = typeof raw.slug === "string" ? raw.slug : "";
    if (slug && (await isImage(HG_LOGO(slug)))) return HG_LOGO(slug);

    const known = KNOWN_DOMAINS[source];
    if (known) return FAVICON(known);

    const products = await this.prisma.retailProduct.findMany({
      where: { storeId },
      select: { productUrl: true, imageUrl: true },
      take: 40,
    });
    const domain = storeDomainFrom(products.flatMap((p) => [p.productUrl, p.imageUrl]));
    return domain ? FAVICON(domain) : null;
  }
}

async function isImage(url: string): Promise<boolean> {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15_000, validateStatus: () => true });
  return res.status === 200 && String(res.headers["content-type"] ?? "").startsWith("image/");
}
