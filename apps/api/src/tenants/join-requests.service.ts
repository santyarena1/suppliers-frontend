import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { TENANT_ROLE_LABELS, type TenantRole } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import type { TenantContext } from "./tenant-context.service";
import { assertPermission } from "./tenant-roles";
import { inviteRolesFor } from "./team-invites.service";
import { joinRequestDecisionMail, joinRequestToOwnerMail } from "./join-request-mail";

/** Siempre la misma respuesta: no revela si el mail es de un dueño. */
export const JOIN_REQUEST_SENT =
  "Si el mail corresponde al dueño de un comercio, le llegó tu pedido. Te avisamos por mail cuando responda.";

/** Pedidos por persona en 24 h, encuentren dueño o no. */
export const MAX_JOIN_REQUESTS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Lo que ve quien pidió: el pedido de los últimos 30 días. */
const MINE_WINDOW_MS = 30 * DAY_MS;

export function normalizeOwnerEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

/**
 * Pedidos para sumarse al equipo de un comercio (tipo 1) sin código: la
 * persona sin organización escribe el mail del dueño; el dueño (o quien
 * gestiona el equipo) lo aprueba con un rol o lo rechaza. Quien ya tiene
 * organización no puede pedir: una persona, una organización.
 */
@Injectable()
export class JoinRequestsService {
  private readonly logger = new Logger(JoinRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService
  ) {}

  // ---------- Quien pide ----------

  async request(userId: string, rawEmail: string) {
    const ownerEmail = normalizeOwnerEmail(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new BadRequestException("Escribí un mail válido");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, active: true, role: true },
    });
    if (!user || !user.active) throw new ForbiddenException("Tu usuario no puede sumarse a un equipo");
    if (user.role === "ROLE_ADMIN") throw new ForbiddenException("El superadmin no se suma a equipos");
    await this.assertWithoutOrganization(userId);

    const pending = await this.prisma.tenantJoinRequest.findFirst({
      where: { userId, status: "PENDING" },
      select: { ownerEmail: true },
    });
    if (pending) {
      throw new ConflictException(
        `Ya tenés un pedido pendiente (${pending.ownerEmail}). Cancelalo para pedirle a otro comercio.`
      );
    }
    const today = await this.prisma.tenantJoinRequest.count({
      where: { userId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
    });
    if (today >= MAX_JOIN_REQUESTS_PER_DAY) {
      throw new HttpException("Llegaste al límite de pedidos por hoy. Probá mañana o pedí un código de invitación.", HttpStatus.TOO_MANY_REQUESTS);
    }

    const owner =
      ownerEmail === user.email.toLowerCase()
        ? null
        : await this.prisma.tenantMembership.findFirst({
            where: {
              role: "OWNER",
              active: true,
              tenant: { type: "RETAILER", active: true, managedByPlatform: false },
              user: { active: true, email: { equals: ownerEmail, mode: "insensitive" } },
            },
            orderBy: { createdAt: "asc" },
            select: { tenantId: true, tenant: { select: { name: true } }, user: { select: { username: true, email: true } } },
          });

    // Sin dueño también se guarda: quien pide ve lo mismo y el tope diario cuenta igual.
    const row = await this.prisma.tenantJoinRequest.create({
      data: { userId, ownerEmail, tenantId: owner?.tenantId ?? null },
    });

    if (owner) {
      await this.prisma.orgNotification
        .create({
          data: {
            toTenantId: owner.tenantId,
            fromTenantId: null,
            kind: "SYSTEM",
            title: `${user.username} quiere sumarse al equipo`,
            body: `${user.username} (${user.email}) pidió sumarse. Aprobalo con un rol o rechazalo en Equipo.`,
            landingKey: `join-request:${row.id}`,
          },
        })
        .catch(() => undefined);
      await this.sendSafely(
        joinRequestToOwnerMail({
          to: owner.user.email,
          ownerName: owner.user.username,
          tenantName: owner.tenant.name,
          requester: { username: user.username, email: user.email },
        })
      );
    }

    return { message: JOIN_REQUEST_SENT, request: this.serializeMine(row) };
  }

  /** El pedido más reciente de la persona (30 días). Nunca dice a qué comercio fue si no lo aprobaron. */
  async mine(userId: string) {
    const row = await this.prisma.tenantJoinRequest.findFirst({
      where: { userId, createdAt: { gt: new Date(Date.now() - MINE_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
    });
    return row ? this.serializeMine(row) : null;
  }

  async cancel(userId: string) {
    const res = await this.prisma.tenantJoinRequest.updateMany({
      where: { userId, status: "PENDING" },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });
    return { cancelled: res.count };
  }

  // ---------- Equipo ----------

  async list(tenant: TenantContext) {
    this.assertManager(tenant);
    const rows = await this.prisma.tenantJoinRequest.findMany({
      where: { tenantId: tenant.tenantId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            active: true,
            memberships: { where: { active: true, tenant: { active: true } }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    // Quien entretanto creó su comercio o entró a otro ya no espera: se da de baja sola.
    const stale = rows.filter((row) => !row.user.active || row.user.memberships.length > 0).map((row) => row.id);
    if (stale.length) {
      await this.prisma.tenantJoinRequest.updateMany({
        where: { id: { in: stale }, status: "PENDING" },
        data: { status: "CANCELLED", decidedAt: new Date() },
      });
    }
    return rows
      .filter((row) => !stale.includes(row.id))
      .map((row) => ({
        id: row.id,
        user: { id: row.user.id, username: row.user.username, email: row.user.email },
        createdAt: row.createdAt.toISOString(),
      }));
  }

  async approve(tenant: TenantContext, id: string, role: TenantRole) {
    this.assertManager(tenant);
    if (!inviteRolesFor(tenant.tenantType).includes(role)) {
      throw new BadRequestException("Ese rol no se puede dar al aprobar un pedido");
    }
    if (tenant.tenantRole !== "OWNER" && role === "ADMIN") {
      throw new ForbiddenException("Solo el dueño puede sumar administradores");
    }
    const row = await this.prisma.tenantJoinRequest.findFirst({
      where: { id, tenantId: tenant.tenantId, status: "PENDING" },
      include: { user: { select: { id: true, username: true, email: true, active: true } } },
    });
    if (!row) throw new NotFoundException("El pedido ya no está pendiente");
    if (!row.user.active) throw new ConflictException("Esa cuenta está desactivada");

    const now = new Date();
    const joinedElsewhere = await this.prisma.$transaction(async (tx) => {
      // Mismo candado que el canje de códigos y el alta: no entra a dos organizaciones a la vez.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`onboarding:${row.userId}`}))`;
      const already = await tx.tenantMembership.findFirst({
        where: { userId: row.userId, active: true, tenant: { active: true } },
        select: { id: true },
      });
      if (already) {
        await tx.tenantJoinRequest.update({ where: { id: row.id }, data: { status: "CANCELLED", decidedAt: now } });
        return true;
      }
      const taken = await tx.tenantJoinRequest.updateMany({
        where: { id: row.id, status: "PENDING" },
        data: { status: "APPROVED", role, decidedById: tenant.userId, decidedAt: now },
      });
      if (taken.count === 0) throw new NotFoundException("El pedido ya no está pendiente");
      // Una membresía vieja e inactiva en el mismo comercio se reactiva con el rol elegido.
      await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.tenantId, userId: row.userId } },
        create: { tenantId: tenant.tenantId, userId: row.userId, role },
        update: { role, active: true },
      });
      return false;
    });
    if (joinedElsewhere) throw new ConflictException("Esa persona ya se sumó a otra organización");

    const roleLabel = TENANT_ROLE_LABELS[role];
    await this.sendSafely(
      joinRequestDecisionMail({ to: row.user.email, username: row.user.username, tenantName: tenant.tenantName, approved: true, roleLabel })
    );
    return { id: row.id, status: "APPROVED" as const, role, roleLabel, username: row.user.username };
  }

  async reject(tenant: TenantContext, id: string) {
    this.assertManager(tenant);
    const row = await this.prisma.tenantJoinRequest.findFirst({
      where: { id, tenantId: tenant.tenantId, status: "PENDING" },
      include: { user: { select: { username: true, email: true } } },
    });
    if (!row) throw new NotFoundException("El pedido ya no está pendiente");
    const res = await this.prisma.tenantJoinRequest.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "REJECTED", decidedById: tenant.userId, decidedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException("El pedido ya no está pendiente");
    await this.sendSafely(
      joinRequestDecisionMail({ to: row.user.email, username: row.user.username, tenantName: tenant.tenantName, approved: false })
    );
    return { id: row.id, status: "REJECTED" as const };
  }

  // ---------- Internos ----------

  private async assertWithoutOrganization(userId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId, active: true, tenant: { active: true } },
      select: { id: true },
    });
    if (membership) throw new ConflictException("Ya pertenecés a una organización");
  }

  private assertManager(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") throw new NotFoundException("Los pedidos para sumarse son para comercios");
    assertPermission(tenant, "team.manage");
  }

  /** El mail es un aviso: si falla, el pedido sigue en Equipo y en la campana. */
  private async sendSafely(message: Parameters<MailService["send"]>[0]) {
    try {
      await this.mail.send(message);
    } catch (err) {
      this.logger.warn(`No se pudo mandar el mail de pedido para sumarse a ${message.to}: ${err instanceof Error ? err.message : err}`);
    }
  }

  private serializeMine(row: { id: string; ownerEmail: string; status: string; createdAt: Date; decidedAt: Date | null }) {
    return {
      id: row.id,
      ownerEmail: row.ownerEmail,
      status: row.status as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED",
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }
}
