import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { UserRole, type CatalogAliasKind } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { brandPlaceholderUsername, newPublicKey } from "./brand-orgs";

@Injectable()
export class BrandOrgsService implements OnModuleInit {
  private readonly log = new Logger(BrandOrgsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const summary = await this.syncCatalogBrands();
      if (summary.created + summary.linked > 0) {
        this.log.log(
          `Marcas del catálogo: ${summary.created} orgs nuevas, ${summary.linked} vinculadas, ${summary.users} dueños placeholder`
        );
      }
    } catch (err) {
      this.log.warn(`No se pudieron asegurar las orgs de marca al arrancar: ${(err as Error).message}`);
    }
  }

  async syncCatalogBrands() {
    const terms = await this.prisma.platformCatalogTerm.findMany({
      where: { kind: "BRAND" },
      select: { id: true, label: true },
      orderBy: { label: "asc" },
    });
    let created = 0;
    let linked = 0;
    let users = 0;
    for (const term of terms) {
      const before = await this.prisma.tenant.findUnique({ where: { catalogTermId: term.id }, select: { id: true } });
      const org = await this.ensureForTerm(term);
      if (!before) {
        if (org.created) created += 1;
        else linked += 1;
      }
      if (org.userCreated) users += 1;
    }
    return { terms: terms.length, created, linked, users };
  }

  async ensureForTerm(term: { id: string; label: string; kind?: CatalogAliasKind }) {
    if (term.kind && term.kind !== "BRAND") return { created: false, userCreated: false, tenantId: null as string | null };
    let created = false;
    let tenant = await this.prisma.tenant.findUnique({ where: { catalogTermId: term.id } });
    if (!tenant) {
      const byName = await this.prisma.tenant.findFirst({
        where: { type: "BRAND", name: { equals: term.label, mode: "insensitive" } },
      });
      if (byName) {
        tenant = await this.prisma.tenant.update({
          where: { id: byName.id },
          data: { catalogTermId: term.id },
        });
      } else {
        tenant = await this.prisma.tenant.create({
          data: {
            name: await this.uniqueTenantName(term.label),
            type: "BRAND",
            catalogTermId: term.id,
            managedByPlatform: true,
            notes: "Org de marca creada desde el catálogo. El dueño es un usuario placeholder hasta que alguien la tome.",
          },
        });
        created = true;
      }
    }

    const landing = await this.prisma.brandLanding.findUnique({ where: { tenantId: tenant.id } });
    if (!landing) {
      await this.prisma.brandLanding.create({
        data: {
          tenantId: tenant.id,
          publicKey: await this.uniquePublicKey(),
          headline: term.label,
        },
      });
    }

    const userCreated = await this.ensureOwner(tenant.id, term.label);
    return { created, userCreated, tenantId: tenant.id };
  }

  private async ensureOwner(tenantId: string, label: string): Promise<boolean> {
    const owner = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, role: "OWNER", active: true },
    });
    if (owner) return false;

    const base = brandPlaceholderUsername(label);
    let username = base;
    let n = 2;
    while (await this.prisma.user.findUnique({ where: { username } })) {
      username = `${base}${n}`;
      n += 1;
    }
    const email = `${username}@nodo.internal`;
    const passwordHash = await argon2.hash(randomBytes(18).toString("base64url"));
    await this.prisma.tenantMembership.create({
      data: {
        role: "OWNER",
        title: "Marca (autoadministrada)",
        tenant: { connect: { id: tenantId } },
        user: {
          create: {
            username,
            email,
            passwordHash,
            role: UserRole.ROLE_USER,
            managedByPlatform: true,
          },
        },
      },
    });
    return true;
  }

  private async uniqueTenantName(label: string) {
    const clash = await this.prisma.tenant.findUnique({ where: { name: label } });
    if (!clash) return label;
    let i = 2;
    while (await this.prisma.tenant.findUnique({ where: { name: `${label} (${i})` } })) i += 1;
    return `${label} (${i})`;
  }

  private async uniquePublicKey() {
    for (let i = 0; i < 8; i++) {
      const key = newPublicKey();
      const exists = await this.prisma.brandLanding.findUnique({ where: { publicKey: key } });
      if (!exists) return key;
    }
    return `${newPublicKey()}${Date.now().toString(36).slice(-4)}`.slice(0, 16);
  }
}
