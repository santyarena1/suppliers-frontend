import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { TENANT_ROLE_LABELS, TENANT_ROLES_BY_TYPE, type TenantRole, type TenantType } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "./tenant-context.service";
import { assertPermission } from "./tenant-roles";
import type { CreateTeamInviteDto } from "./dto/team-invite.dto";

/** Sin caracteres ambiguos: el código se dicta o se tipea a mano. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ACTIVE_CODES = 20;

export function generateTeamInviteCode(): string {
  const chars = Array.from(randomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

/** Llega como llega (minúsculas, sin guion, con espacios). */
export function normalizeTeamInviteCode(raw: string): string {
  const clean = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** Roles que se pueden dar con un código: los del tipo de organización, nunca dueño. */
export function inviteRolesFor(type: TenantType): TenantRole[] {
  return TENANT_ROLES_BY_TYPE[type].filter((role) => role !== "OWNER");
}

type InviteRow = {
  id: string;
  code: string;
  role: TenantRole;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  revoked: boolean;
  createdAt: Date;
};

export function inviteStatus(row: Pick<InviteRow, "revoked" | "expiresAt" | "maxUses" | "usedCount">, now = new Date()) {
  if (row.revoked) return "REVOKED" as const;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "EXPIRED" as const;
  if (row.maxUses != null && row.usedCount >= row.maxUses) return "EXHAUSTED" as const;
  return "ACTIVE" as const;
}

const INVALID = "El código no es válido, ya se usó o venció. Pedile uno nuevo a quien te invitó.";

/**
 * Códigos para sumarse al equipo de un comercio (tipo 1). El dueño o quien
 * gestiona el equipo los crea con un rol; quien se registra con el código
 * entra a la organización con ese rol. El canje es atómico: un código de un
 * uso no entra dos veces aunque lo canjeen a la vez.
 */
@Injectable()
export class TeamInvitesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Equipo ----------

  async list(tenant: TenantContext) {
    this.assertManager(tenant);
    const rows = await this.prisma.teamInviteCode.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { redemptions: { select: { userId: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
    });
    // Quién entró con cada código, para verlo en Equipo.
    const userIds = [...new Set(rows.flatMap((row) => row.redemptions.map((r) => r.userId)))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : [];
    const username = new Map(users.map((u) => [u.id, u.username]));
    return rows.map((row) => ({
      ...this.serialize(row as InviteRow),
      usedBy: row.redemptions.map((r) => ({ username: username.get(r.userId) ?? "Usuario", at: r.createdAt.toISOString() })),
    }));
  }

  async create(tenant: TenantContext, dto: CreateTeamInviteDto) {
    this.assertManager(tenant);
    if (!inviteRolesFor(tenant.tenantType).includes(dto.role)) {
      throw new BadRequestException("Ese rol no se puede dar con un código de invitación");
    }
    if (tenant.tenantRole !== "OWNER" && dto.role === "ADMIN") {
      throw new ForbiddenException("Solo el dueño puede invitar administradores");
    }
    const active = await this.prisma.teamInviteCode.findMany({
      where: { tenantId: tenant.tenantId, revoked: false },
      select: { revoked: true, expiresAt: true, maxUses: true, usedCount: true },
    });
    if (active.filter((row) => inviteStatus(row) === "ACTIVE").length >= MAX_ACTIVE_CODES) {
      throw new BadRequestException(`Ya tenés ${MAX_ACTIVE_CODES} códigos activos: revocá alguno para crear otro`);
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await this.prisma.teamInviteCode.create({
          data: {
            tenantId: tenant.tenantId,
            code: generateTeamInviteCode(),
            role: dto.role,
            maxUses: dto.maxUses ?? null,
            // Los códigos no vencen: valen hasta que se usan o se revocan.
            expiresAt: null,
            createdById: tenant.userId,
          },
        });
        return this.serialize(row as InviteRow);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    throw new ConflictException("No se pudo generar un código, probá de nuevo");
  }

  async revoke(tenant: TenantContext, id: string) {
    this.assertManager(tenant);
    const res = await this.prisma.teamInviteCode.updateMany({
      where: { id, tenantId: tenant.tenantId },
      data: { revoked: true },
    });
    if (res.count === 0) throw new NotFoundException("Código no encontrado");
    return { id, revoked: true };
  }

  // ---------- Registro ----------

  /** Público: solo lo justo para el registro. Un código que no sirve no dice nada más. */
  async preview(raw: string) {
    const code = normalizeTeamInviteCode(raw);
    if (code.length !== 9) return { valid: false as const };
    const row = await this.prisma.teamInviteCode.findUnique({
      where: { code },
      select: {
        role: true,
        revoked: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
        tenant: { select: { name: true, active: true, type: true } },
      },
    });
    if (!row || !row.tenant.active || row.tenant.type !== "RETAILER" || inviteStatus(row) !== "ACTIVE") {
      return { valid: false as const };
    }
    return {
      valid: true as const,
      organizationName: row.tenant.name,
      roleLabel: TENANT_ROLE_LABELS[row.role as TenantRole],
    };
  }

  /**
   * Canje: descuenta un uso con condición (no se pasa del tope aunque lo canjeen
   * a la vez) y crea la membresía, todo en una transacción y con un candado por
   * usuario (doble click o dos pestañas no lo meten dos veces).
   */
  async redeem(userId: string, raw: string) {
    const code = normalizeTeamInviteCode(raw);
    const invalid = new BadRequestException({ message: INVALID, code: "TEAM_INVITE_INVALID" });
    if (code.length !== 9) throw invalid;
    const invite = await this.prisma.teamInviteCode.findUnique({
      where: { code },
      include: { tenant: { select: { id: true, name: true, active: true, type: true } } },
    });
    if (!invite || !invite.tenant.active || invite.tenant.type !== "RETAILER") throw invalid;
    if (inviteStatus(invite) !== "ACTIVE") throw invalid;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, active: true, role: true },
    });
    if (!user || !user.active) throw new ForbiddenException("Tu usuario no puede sumarse a un equipo");
    if (user.role === "ROLE_ADMIN") throw new ForbiddenException("El superadmin no se suma a equipos con un código");

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`onboarding:${userId}`}))`;
      const already = await tx.tenantMembership.findFirst({
        where: { userId, active: true, tenant: { active: true } },
        select: { id: true },
      });
      if (already) throw new ConflictException("Ya pertenecés a una organización");
      const taken = await tx.teamInviteCode.updateMany({
        where: {
          id: invite.id,
          revoked: false,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          ...(invite.maxUses != null ? { usedCount: { lt: invite.maxUses } } : {}),
        },
        data: { usedCount: { increment: 1 } },
      });
      if (taken.count === 0) throw invalid;
      // Una membresía vieja e inactiva en el mismo comercio se reactiva con el rol del código.
      await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: invite.tenantId, userId } },
        create: { tenantId: invite.tenantId, userId, role: invite.role },
        update: { role: invite.role, active: true },
      });
      await tx.teamInviteRedemption.create({ data: { inviteId: invite.id, userId } });
    });

    const roleLabel = TENANT_ROLE_LABELS[invite.role as TenantRole];
    await this.prisma.orgNotification
      .create({
        data: {
          toTenantId: invite.tenantId,
          fromTenantId: null,
          kind: "SYSTEM",
          title: `${user.username} entró al equipo`,
          body: `${user.username} se sumó con el código ${invite.code} como ${roleLabel}. Podés cambiarle el rol o los permisos en Equipo.`,
          landingKey: `team-invite:${invite.id}:${userId}`,
        },
      })
      .catch(() => undefined);

    return { tenantId: invite.tenantId, tenantName: invite.tenant.name, role: invite.role as TenantRole, roleLabel };
  }

  private assertManager(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") throw new NotFoundException("Los códigos de equipo son para comercios");
    assertPermission(tenant, "team.manage");
  }

  private serialize(row: InviteRow) {
    return {
      id: row.id,
      code: row.code,
      role: row.role,
      roleLabel: TENANT_ROLE_LABELS[row.role],
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revoked: row.revoked,
      status: inviteStatus(row),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
