import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { InboxService } from "../inbox/inbox.service";
import { inboxRequester } from "./subscription-inbox";
import { Prisma } from "@prisma/client";
import {
  CATALOG_API_ADDON_PRICE_USD,
  addDays,
  addMonths,
  monthlyAmount,
  planIncludesCatalogApi,
  computeSubscriptionState,
  getPlanCapabilities,
  isTenantPlan,
  paymentPeriod,
  pickSearchProvidersOnDowngrade,
  PLAN_CATALOG,
  resolveEntitlements,
  SETUP_FEE_STATUS_LABELS,
  SUBSCRIPTION_PAYMENT_PROVIDER_LABELS,
  SUBSCRIPTION_POLICY,
  SUBSCRIPTION_STATUS_LABELS,
  UNRESTRICTED_CAPABILITIES,
  type PlanCapabilities,
  type SetupFeeStatus,
  type SubscriptionAccess,
  type SubscriptionPaymentProvider,
  type SubscriptionStatus,
  type TenantPlan,
  TENANT_PLAN_LABELS,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { commercialId, toSubscriptionDates, type TenantContext } from "../tenants/tenant-context.service";
import { TenantVisibilityService, type SearchUsage } from "../tenants/tenant-visibility.service";
import type {
  AdminSubscriptionFilter,
  ChangePlanDto,
  CourtesyDto,
  EndCourtesyDto,
  PaymentNoticeDto,
  PlanRequestDto,
  RegisterPaymentDto,
  SetupFeeDto,
} from "./dto/subscription.dto";

type SubscriptionRow = Prisma.SubscriptionGetPayload<object>;
type Tx = Prisma.TransactionClient;

/** Quién hizo el cambio. `null` = el sistema (cron). */
export interface SubscriptionActor {
  userId: string | null;
}

export interface SubscriptionView {
  tenantId: string;
  tenantName: string;
  plan: TenantPlan;
  planLabel: string;
  /** Precio mensual del plan (pactado o de lista), sin módulos. */
  price: number;
  /** Lo que se cobra por mes: plan + módulos activos (en Custom la API de catálogo no suma). */
  monthlyTotal: number;
  listPrice: number;
  priceOverridden: boolean;
  currency: string;
  status: SubscriptionStatus;
  statusLabel: string;
  access: SubscriptionAccess;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  dueAt: string | null;
  suspendsAt: string | null;
  daysUntilDue: number | null;
  daysOverdue: number | null;
  trialEndsAt: string | null;
  cancelledAt: string | null;
  setupFee: { amount: number | null; status: SetupFeeStatus; statusLabel: string; paidAt: string | null; blocksCustom: boolean };
  capabilities: PlanCapabilities;
  /** Módulos extra. `monthlyTotal` ya los incluye; `price` no. */
  addons: { catalogApi: CatalogApiAddonView };
  /** Atajo del módulo de API de catálogo (mismo dato que addons.catalogApi). */
  catalogApiAddon: CatalogApiAddonView;
}

export interface CatalogApiAddonView {
  enabled: boolean;
  /** Custom la trae incluida: no se cobra aparte. */
  includedInPlan: boolean;
  priceUsd: number;
  since: string | null;
  /** Activo de cortesía: no se cobra. */
  courtesy: boolean;
}

export interface AdminSubscriptionView extends SubscriptionView {
  storedStatus: SubscriptionStatus;
  courtesy: { active: boolean; until: string | null; reason: string | null };
  suspensionReason: string | null;
  cancellationReason: string | null;
  notes: string | null;
  gracePeriodEnd: string | null;
  lastPayment: { amount: number; paidAt: string | null; provider: string } | null;
  pendingRequest: { plan: TenantPlan | null; at: string; message: string | null } | null;
  paymentNoticeAt: string | null;
  tenantActive: boolean;
  createdAt: string;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? null : Number(d));
const parseDate = (value: string | undefined | null): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException("Fecha inválida");
  return d;
};

const REQUEST_EVENTS = ["UPGRADE_REQUESTED", "PLAN_REQUESTED"];

/**
 * Suscripciones de los comercios (Tipo 1). El plan vive en `Tenant.plan`; acá van
 * el estado, las fechas, los pagos y el historial. Distribuidores y marcas no
 * tienen suscripción comercial. Ver docs/PLAN_SUSCRIPCIONES.md.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TenantVisibilityService,
    @Optional() private readonly inbox?: InboxService
  ) {}

  // ---------- Lectura ----------

  /** Lo que ve el comercio en "Plan y facturación". La cortesía se muestra como activa. */
  async mine(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") throw new NotFoundException("Esta organización no tiene suscripción");
    const { tenantRow, sub } = await this.load(tenant.tenantId);
    const view = this.toView(tenantRow, sub);
    const clientView: SubscriptionView = view.status === "COURTESY" ? { ...view, status: "ACTIVE", statusLabel: SUBSCRIPTION_STATUS_LABELS.ACTIVE } : view;
    const [usage, payments] = await Promise.all([
      this.visibility.searchUsage(commercialId(tenant), tenant.userId),
      sub
        ? this.prisma.subscriptionPayment.findMany({
            where: { subscriptionId: sub.id, status: "PAID" },
            orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
            take: 24,
          })
        : Promise.resolve([]),
    ]);
    const entitlements = tenant.entitlements;
    const bypass = !!entitlements && !entitlements.enforced;
    return {
      ...clientView,
      // Superadmin en su sesión: sin topes ni cortes, pero ve la suscripción real.
      access: bypass ? ("FULL" as const) : clientView.access,
      capabilities: bypass ? { ...UNRESTRICTED_CAPABILITIES } : view.capabilities,
      usage: {
        connectedProviders: usage.connectedProviders,
        activeSearchProviders: usage.activeSearchProviders,
        maxSearchProviders: entitlements && !entitlements.enforced ? null : usage.maxSearchProviders,
      } satisfies SearchUsage,
      canManage: this.canManage(tenant),
      payments: payments.map((p) => ({
        id: p.id,
        kind: p.kind,
        plan: p.plan,
        planLabel: p.plan ? PLAN_CATALOG[p.plan as TenantPlan].label : null,
        amount: Number(p.amount),
        currency: p.currency,
        paidAt: iso(p.paidAt),
        periodStart: iso(p.periodStart),
        periodEnd: iso(p.periodEnd),
        provider: p.provider,
        providerLabel: SUBSCRIPTION_PAYMENT_PROVIDER_LABELS[p.provider as SubscriptionPaymentProvider] ?? p.provider,
      })),
    };
  }

  async adminList(filter: AdminSubscriptionFilter = "all", q?: string, now = new Date()) {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        type: "RETAILER",
        ...(q?.trim() ? { name: { contains: q.trim(), mode: "insensitive" as const } } : {}),
      },
      include: {
        subscription: {
          include: {
            payments: { where: { status: "PAID" }, orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }], take: 1 },
            events: {
              where: { type: { in: [...REQUEST_EVENTS, "PAYMENT_NOTICE", "PLAN_CHANGED", "PAYMENT_RECORDED"] } },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    const rows = tenants.map((t) => this.toAdminView(t, t.subscription, now));
    const counts = Object.fromEntries(
      (["all", "active", "upcoming", "past_due", "grace", "suspended", "courtesy", "cancelled"] as const).map((f) => [
        f,
        rows.filter((r) => matchesFilter(r, f)).length,
      ])
    ) as Record<AdminSubscriptionFilter, number>;
    return { counts, rows: rows.filter((r) => matchesFilter(r, filter)) };
  }

  async adminDetail(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscription: {
          include: {
            payments: { orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }], take: 100 },
            events: { orderBy: { createdAt: "desc" }, take: 200 },
            reminders: { orderBy: { createdAt: "desc" }, take: 50 },
          },
        },
      },
    });
    if (!tenant || tenant.type !== "RETAILER") throw new NotFoundException("Comercio no encontrado");
    const actorIds = [
      ...new Set(
        [
          ...(tenant.subscription?.events ?? []).map((e) => e.actorUserId),
          ...(tenant.subscription?.payments ?? []).map((p) => p.recordedById),
        ].filter((v): v is string => Boolean(v))
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true } })
      : [];
    const nameOf = new Map(actors.map((a) => [a.id, a.username]));
    const usage = await this.visibility.searchUsage(tenantId);
    return {
      ...this.toAdminView(tenant, tenant.subscription),
      usage,
      payments: (tenant.subscription?.payments ?? []).map((p) => ({
        id: p.id,
        kind: p.kind,
        plan: p.plan,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        providerLabel: SUBSCRIPTION_PAYMENT_PROVIDER_LABELS[p.provider as SubscriptionPaymentProvider] ?? p.provider,
        externalReference: p.externalReference,
        paidAt: iso(p.paidAt),
        periodStart: iso(p.periodStart),
        periodEnd: iso(p.periodEnd),
        notes: p.notes,
        recordedBy: p.recordedById ? nameOf.get(p.recordedById) ?? null : null,
        createdAt: p.createdAt.toISOString(),
      })),
      events: (tenant.subscription?.events ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        fromPlan: e.fromPlan,
        toPlan: e.toPlan,
        actor: e.actorUserId ? nameOf.get(e.actorUserId) ?? null : null,
        data: e.data,
        createdAt: e.createdAt.toISOString(),
      })),
      reminders: (tenant.subscription?.reminders ?? []).map((r) => ({
        id: r.id,
        kind: r.kind,
        channel: r.channel,
        status: r.status,
        anchorAt: r.anchorAt.toISOString(),
        sentAt: iso(r.sentAt),
      })),
    };
  }

  // ---------- Acciones del comercio ----------

  /**
   * Base → Pro se aplica al instante si la suscripción está al día: el precio nuevo
   * corre desde el próximo cobro. Cualquier otro cambio (Custom, bajar de plan, o
   * con la cuenta vencida) queda como solicitud para Administración.
   */
  async upgradeMine(tenant: TenantContext, dto: PlanRequestDto) {
    this.assertCanManage(tenant);
    const { tenantRow, sub } = await this.load(tenant.tenantId);
    const current = tenantRow.plan as TenantPlan;
    const state = computeSubscriptionState(sub ? toSubscriptionDates(sub) : null);
    const selfServe =
      current === "BASE" && dto.plan === "PRO" && ["ACTIVE", "TRIAL", "COURTESY"].includes(state.status);
    if (!selfServe) {
      await this.request(tenant, dto);
      return { applied: false, requested: true, subscription: await this.mine(await this.refreshContext(tenant)) };
    }
    await this.changePlan({ userId: tenant.userId }, tenant.tenantId, { plan: "PRO", reason: "Upgrade desde Plan y facturación" });
    return { applied: true, requested: false, subscription: await this.mine(await this.refreshContext(tenant)) };
  }

  async request(tenant: TenantContext, dto: PlanRequestDto) {
    this.assertCanManage(tenant);
    const sub = await this.ensure(tenant.tenantId);
    const tenantRow = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenant.tenantId }, select: { plan: true } });
    await this.prisma.subscriptionEvent.create({
      data: {
        tenantId: tenant.tenantId,
        subscriptionId: sub.id,
        type: "PLAN_REQUESTED",
        fromPlan: tenantRow.plan,
        toPlan: dto.plan,
        actorUserId: tenant.userId,
        data: { message: dto.message?.trim() || null },
      },
    });
    const who = await inboxRequester(this.prisma, tenant);
    void this.inbox?.record({
      ...who,
      type: "PLAN_REQUEST",
      title: `${who.company} pide pasar a ${TENANT_PLAN_LABELS[dto.plan]}`,
      message: dto.message,
      data: { "Plan actual": TENANT_PLAN_LABELS[tenantRow.plan as TenantPlan], "Plan pedido": TENANT_PLAN_LABELS[dto.plan] },
    });
    return { requested: true };
  }

  /** El comercio avisa que pagó (transferencia, etc.). Anda con la cuenta suspendida. */
  async paymentNotice(tenant: TenantContext, dto: PaymentNoticeDto) {
    if (tenant.tenantType !== "RETAILER") throw new NotFoundException("Esta organización no tiene suscripción");
    const sub = await this.ensure(tenant.tenantId);
    await this.prisma.subscriptionEvent.create({
      data: {
        tenantId: tenant.tenantId,
        subscriptionId: sub.id,
        type: "PAYMENT_NOTICE",
        actorUserId: tenant.userId,
        data: { reference: dto.reference?.trim() || null, message: dto.message?.trim() || null },
      },
    });
    const who = await inboxRequester(this.prisma, tenant);
    void this.inbox?.record({
      ...who,
      type: "PAYMENT_NOTICE",
      title: `${who.company} avisa que pagó`,
      message: dto.message,
      data: { "Nº de operación": dto.reference?.trim() || null },
    });
    return { received: true };
  }

  // ---------- Administración ----------

  async changePlan(actor: SubscriptionActor, tenantId: string, dto: ChangePlanDto) {
    if (!isTenantPlan(dto.plan)) throw new BadRequestException("Plan inválido");
    const { tenantRow, sub } = await this.loadForWrite(tenantId);
    const from = tenantRow.plan as TenantPlan;
    const to = dto.plan;
    const fromMax = getPlanCapabilities(from).maxSearchProviders;
    const toMax = getPlanCapabilities(to).maxSearchProviders;

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { plan: to } });
      const data: Prisma.SubscriptionUpdateInput = {};
      if (dto.price !== undefined) data.priceOverride = dto.price == null ? null : new Prisma.Decimal(dto.price);
      if (to === "CUSTOM" && sub.setupFeeStatus === "NOT_APPLICABLE") {
        data.setupFee = new Prisma.Decimal(PLAN_CATALOG.CUSTOM.setupFee ?? 0);
        data.setupFeeStatus = "PENDING";
      }
      if (Object.keys(data).length) await tx.subscription.update({ where: { id: sub.id }, data });
      await this.searchOnPlanChange(tx, tenantId, fromMax, toMax);
      await this.event(tx, sub, actor, "PLAN_CHANGED", {
        fromPlan: from,
        toPlan: to,
        data: { reason: dto.reason ?? null, price: dto.price ?? null },
      });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_PLAN_CHANGED", { from, to, price: dto.price ?? null, reason: dto.reason ?? null });
    });
    return this.adminDetail(tenantId);
  }

  async registerPayment(actor: SubscriptionActor, tenantId: string, dto: RegisterPaymentDto, now = new Date()) {
    const { tenantRow, sub } = await this.loadForWrite(tenantId);
    const plan = tenantRow.plan as TenantPlan;
    const provider = dto.provider ?? "MANUAL";
    const paidAt = parseDate(dto.paidAt) ?? now;
    const kind = dto.kind ?? "SUBSCRIPTION";
    const reference = dto.externalReference?.trim() || null;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (kind === "SETUP_FEE") {
          const amount = dto.amount ?? num(sub.setupFee) ?? PLAN_CATALOG.CUSTOM.setupFee ?? 0;
          await tx.subscriptionPayment.create({
            data: {
              tenantId,
              subscriptionId: sub.id,
              kind: "SETUP_FEE",
              plan,
              amount: new Prisma.Decimal(amount),
              currency: sub.currency,
              status: "PAID",
              provider,
              externalReference: reference,
              paidAt,
              notes: dto.notes?.trim() || null,
              recordedById: actor.userId,
            },
          });
          await tx.subscription.update({
            where: { id: sub.id },
            data: { setupFeeStatus: "PAID", setupFeePaidAt: paidAt, setupFee: new Prisma.Decimal(amount) },
          });
          await this.event(tx, sub, actor, "SETUP_FEE_PAID", { data: { amount, provider } });
          await this.audit(tx, actor, tenantId, "SUBSCRIPTION_SETUP_FEE_PAID", { amount, provider, reference });
          return;
        }

        const months = dto.months ?? 1;
        const state = computeSubscriptionState(toSubscriptionDates(sub), now);
        const period = paymentPeriod({
          state,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          paidAt,
          months,
          periodStart: parseDate(dto.periodStart),
          periodEnd: parseDate(dto.periodEnd),
          now,
        });
        const amount = dto.amount ?? this.totalOf(plan, sub) * months;
        await tx.subscriptionPayment.create({
          data: {
            tenantId,
            subscriptionId: sub.id,
            kind: "SUBSCRIPTION",
            plan,
            amount: new Prisma.Decimal(amount),
            currency: sub.currency,
            status: "PAID",
            provider,
            externalReference: reference,
            paidAt,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            notes: dto.notes?.trim() || null,
            recordedById: actor.userId,
          },
        });
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: "ACTIVE",
            currentPeriodStart: period.currentPeriodStart,
            currentPeriodEnd: period.currentPeriodEnd,
            nextBillingAt: period.currentPeriodEnd,
            gracePeriodEnd: null,
            trialEndsAt: null,
            suspendedAt: null,
            suspensionReason: null,
            cancelledAt: null,
            cancellationReason: null,
            courtesyUntil: null,
          },
        });
        await this.event(tx, sub, actor, "PAYMENT_RECORDED", {
          fromStatus: state.status,
          toStatus: "ACTIVE",
          data: { amount, months, provider, periodStart: iso(period.periodStart), periodEnd: iso(period.periodEnd) },
        });
        await this.audit(tx, actor, tenantId, "SUBSCRIPTION_PAYMENT_RECORDED", {
          amount,
          months,
          provider,
          reference,
          fromStatus: state.status,
          periodEnd: iso(period.currentPeriodEnd),
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya hay un pago registrado con esa referencia");
      }
      throw error;
    }
    return this.adminDetail(tenantId);
  }

  async setBillingDate(actor: SubscriptionActor, tenantId: string, nextBillingAt: string) {
    const date = parseDate(nextBillingAt);
    if (!date) throw new BadRequestException("Fecha inválida");
    const { sub } = await this.loadForWrite(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          nextBillingAt: date,
          ...(sub.status === "TRIAL" ? { trialEndsAt: date } : {}),
          ...(sub.status === "COURTESY" && sub.courtesyUntil ? { courtesyUntil: date } : {}),
          gracePeriodEnd: null,
          ...this.liftOverdueSuspension(sub),
        },
      });
      await this.event(tx, sub, actor, "BILLING_DATE_CHANGED", { data: { from: iso(sub.nextBillingAt ?? sub.currentPeriodEnd), to: iso(date) } });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_BILLING_DATE_CHANGED", { to: iso(date) });
    });
    return this.adminDetail(tenantId);
  }

  /** Corre el vencimiento N días (o el fin de la prueba / de la cortesía con fecha). */
  async extend(actor: SubscriptionActor, tenantId: string, days: number, reason?: string, now = new Date()) {
    const { sub } = await this.loadForWrite(tenantId);
    const state = computeSubscriptionState(toSubscriptionDates(sub), now);
    const base = state.dueAt && state.dueAt > now ? state.dueAt : state.dueAt ?? now;
    const to = addDays(base, days);
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          nextBillingAt: to,
          ...(sub.status === "TRIAL" ? { trialEndsAt: to } : {}),
          ...(sub.status === "COURTESY" && sub.courtesyUntil ? { courtesyUntil: to } : {}),
          gracePeriodEnd: null,
          ...this.liftOverdueSuspension(sub),
        },
      });
      await this.event(tx, sub, actor, "EXTENDED", { data: { days, from: iso(state.dueAt), to: iso(to), reason: reason ?? null } });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_EXTENDED", { days, to: iso(to), reason: reason ?? null });
    });
    return this.adminDetail(tenantId);
  }

  async setCourtesy(actor: SubscriptionActor, tenantId: string, dto: CourtesyDto) {
    if (dto.plan) {
      const { tenantRow } = await this.loadForWrite(tenantId);
      if (tenantRow.plan !== dto.plan) await this.changePlan(actor, tenantId, { plan: dto.plan, reason: "Cortesía" });
    }
    const { sub } = await this.loadForWrite(tenantId);
    const until = dto.until ? parseDate(dto.until) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: "COURTESY",
          courtesyUntil: until,
          courtesyReason: dto.reason?.trim() || null,
          nextBillingAt: until,
          gracePeriodEnd: null,
          suspendedAt: null,
          suspensionReason: null,
          cancelledAt: null,
          cancellationReason: null,
        },
      });
      await this.event(tx, sub, actor, "COURTESY_SET", {
        fromStatus: sub.status as SubscriptionStatus,
        toStatus: "COURTESY",
        data: { until: iso(until), reason: dto.reason ?? null, plan: dto.plan ?? null },
      });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_COURTESY_SET", { until: iso(until), reason: dto.reason ?? null, plan: dto.plan ?? null });
    });
    return this.adminDetail(tenantId);
  }

  async endCourtesy(actor: SubscriptionActor, tenantId: string, dto: EndCourtesyDto, now = new Date()) {
    const { sub } = await this.loadForWrite(tenantId);
    if (sub.status !== "COURTESY") throw new BadRequestException("Este comercio no está en cortesía");
    const next =
      dto.mode === "CANCEL" ? now : parseDate(dto.nextBillingAt) ?? sub.courtesyUntil ?? addMonths(now, 1);
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          courtesyUntil: null,
          currentPeriodStart: now,
          currentPeriodEnd: next,
          nextBillingAt: next,
          gracePeriodEnd: null,
        },
      });
      await this.event(tx, sub, actor, dto.mode === "CANCEL" ? "COURTESY_CANCELLED" : "COURTESY_CONVERTED", {
        fromStatus: "COURTESY",
        toStatus: "ACTIVE",
        data: { nextBillingAt: iso(next) },
      });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_COURTESY_ENDED", { mode: dto.mode, nextBillingAt: iso(next) });
    });
    return this.adminDetail(tenantId);
  }

  async suspend(actor: SubscriptionActor, tenantId: string, reason?: string, now = new Date()) {
    const { sub } = await this.loadForWrite(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: "SUSPENDED", suspendedAt: now, suspensionReason: "MANUAL" },
      });
      await this.event(tx, sub, actor, "SUSPENDED", {
        fromStatus: sub.status as SubscriptionStatus,
        toStatus: "SUSPENDED",
        data: { reason: reason ?? null, manual: true },
      });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_SUSPENDED", { reason: reason ?? null });
    });
    return this.adminDetail(tenantId);
  }

  /**
   * Levanta la suspensión (o la cancelación) sin registrar un pago. Si el
   * vencimiento ya pasó, le da un período de gracia completo desde hoy.
   */
  async reactivate(actor: SubscriptionActor, tenantId: string, nextBillingAt?: string, now = new Date()) {
    const { sub } = await this.loadForWrite(tenantId);
    const explicit = parseDate(nextBillingAt);
    const due = explicit ?? sub.nextBillingAt ?? sub.currentPeriodEnd;
    const needsGrace = !explicit && (!due || due <= now);
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          suspendedAt: null,
          suspensionReason: null,
          cancelledAt: null,
          cancellationReason: null,
          nextBillingAt: due ?? now,
          gracePeriodEnd: needsGrace ? addDays(now, SUBSCRIPTION_POLICY.graceDays) : null,
        },
      });
      await this.event(tx, sub, actor, "REACTIVATED", {
        fromStatus: sub.status as SubscriptionStatus,
        toStatus: "ACTIVE",
        data: { nextBillingAt: iso(due ?? now), graceUntil: needsGrace ? iso(addDays(now, SUBSCRIPTION_POLICY.graceDays)) : null },
      });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_REACTIVATED", { nextBillingAt: iso(due ?? now) });
    });
    return this.adminDetail(tenantId);
  }

  async cancel(actor: SubscriptionActor, tenantId: string, reason?: string, now = new Date()) {
    const { sub } = await this.loadForWrite(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: "CANCELLED", cancelledAt: now, cancellationReason: reason?.trim() || null },
      });
      await this.event(tx, sub, actor, "CANCELLED", {
        fromStatus: sub.status as SubscriptionStatus,
        toStatus: "CANCELLED",
        data: { reason: reason ?? null },
      });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_CANCELLED", { reason: reason ?? null });
    });
    return this.adminDetail(tenantId);
  }

  async setNotes(actor: SubscriptionActor, tenantId: string, notes: string | null) {
    const { sub } = await this.loadForWrite(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id: sub.id }, data: { notes: notes?.trim() || null } });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_NOTES_UPDATED", {});
    });
    return this.adminDetail(tenantId);
  }

  async setSetupFee(actor: SubscriptionActor, tenantId: string, dto: SetupFeeDto, now = new Date()) {
    const { sub } = await this.loadForWrite(tenantId);
    const data: Prisma.SubscriptionUpdateInput = {};
    if (dto.status) {
      data.setupFeeStatus = dto.status;
      data.setupFeePaidAt = dto.status === "PAID" ? sub.setupFeePaidAt ?? now : null;
    }
    if (dto.amount !== undefined) data.setupFee = dto.amount == null ? null : new Prisma.Decimal(dto.amount);
    if (dto.blocksCustom !== undefined) data.setupFeeBlocksCustom = dto.blocksCustom;
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id: sub.id }, data });
      await this.event(tx, sub, actor, "SETUP_FEE_UPDATED", {
        data: { status: dto.status ?? null, amount: dto.amount ?? null, blocksCustom: dto.blocksCustom ?? null },
      });
      await this.audit(tx, actor, tenantId, "SUBSCRIPTION_SETUP_FEE_UPDATED", { ...dto });
    });
    return this.adminDetail(tenantId);
  }

  // ---------- Internos ----------

  /** La fila de suscripción del comercio. Si no existe (alta por fuera del onboarding), la crea en cortesía. */
  async ensure(tenantId: string): Promise<SubscriptionRow> {
    const found = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (found) return found;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { type: true } });
    if (!tenant) throw new NotFoundException("Organización no encontrada");
    if (tenant.type !== "RETAILER") throw new BadRequestException("Solo los comercios tienen suscripción");
    return this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        status: "COURTESY",
        courtesyReason: "Alta sin suscripción: queda en cortesía hasta que Administración la configure",
        events: { create: { tenantId, type: "CREATED", toStatus: "COURTESY", data: { auto: true } } },
      },
      update: {},
    });
  }

  private async load(tenantId: string) {
    const tenantRow = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, type: true, plan: true, active: true, createdAt: true, subscription: true },
    });
    if (!tenantRow) throw new NotFoundException("Organización no encontrada");
    return { tenantRow, sub: tenantRow.subscription };
  }

  private async loadForWrite(tenantId: string) {
    const { tenantRow } = await this.load(tenantId);
    if (tenantRow.type !== "RETAILER") throw new BadRequestException("Solo los comercios tienen suscripción");
    const sub = await this.ensure(tenantId);
    return { tenantRow, sub };
  }

  /** Para devolver la vista con el plan recién cambiado. */
  private async refreshContext(tenant: TenantContext): Promise<TenantContext> {
    const { tenantRow, sub } = await this.load(tenant.tenantId);
    return {
      ...tenant,
      entitlements: resolveEntitlements({
        tenantType: tenant.tenantType,
        plan: tenantRow.plan as TenantPlan,
        subscription: sub ? toSubscriptionDates(sub) : null,
        platformAdmin: tenant.entitlements ? !tenant.entitlements.enforced : false,
      }),
    };
  }

  private canManage(tenant: TenantContext): boolean {
    return tenant.tenantRole === "OWNER" || tenant.tenantRole === "ADMIN" || tenant.permissions.includes("team.manage");
  }

  private assertCanManage(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") throw new NotFoundException("Esta organización no tiene suscripción");
    if (!this.canManage(tenant)) throw new ForbiddenException("Solo el dueño de la organización puede cambiar el plan");
  }

  /** Precio del plan (pactado o de lista), sin módulos. */
  private priceOf(plan: TenantPlan, sub: Pick<SubscriptionRow, "priceOverride"> | null): number {
    return sub?.priceOverride != null ? Number(sub.priceOverride) : PLAN_CATALOG[plan].monthlyPrice;
  }

  /** Cuota mensual: plan más los módulos activos. */
  private totalOf(
    plan: TenantPlan,
    sub: Pick<SubscriptionRow, "priceOverride" | "catalogApiAddon" | "catalogApiAddonCourtesy"> | null
  ): number {
    return monthlyAmount(plan, sub?.priceOverride != null ? Number(sub.priceOverride) : null, {
      // De cortesía está activo pero no se cobra.
      catalogApi: Boolean(sub?.catalogApiAddon) && !sub?.catalogApiAddonCourtesy,
    });
  }

  private catalogApiAddonOf(
    plan: TenantPlan,
    sub: Pick<SubscriptionRow, "catalogApiAddon" | "catalogApiAddonSince" | "catalogApiAddonCourtesy"> | null
  ): CatalogApiAddonView {
    const included = planIncludesCatalogApi(plan);
    return {
      enabled: included || Boolean(sub?.catalogApiAddon),
      includedInPlan: included,
      priceUsd: CATALOG_API_ADDON_PRICE_USD,
      since: iso(sub?.catalogApiAddonSince),
      courtesy: !included && Boolean(sub?.catalogApiAddon && sub?.catalogApiAddonCourtesy),
    };
  }

  /** Estado del módulo de API de catálogo de un comercio (para Configuración → API de catálogo). */
  async catalogApiAddon(tenantId: string): Promise<CatalogApiAddonView> {
    const { tenantRow, sub } = await this.load(tenantId);
    const plan = (isTenantPlan(tenantRow.plan) ? tenantRow.plan : "PRO") as TenantPlan;
    return this.catalogApiAddonOf(plan, sub);
  }

  /**
   * Prende o apaga el módulo de API de catálogo. Corre desde el próximo cobro (la
   * cuota pasa a ser plan + US$ 10). En Custom viene incluido: no cambia nada.
   * Apagarlo no borra las keys: dejan de responder hasta que se vuelva a prender.
   */
  async setCatalogApiAddon(
    actor: SubscriptionActor,
    tenantId: string,
    enabled: boolean,
    opts: { fromTenant?: TenantContext; courtesy?: boolean } = {}
  ) {
    const { tenantRow, sub } = await this.loadForWrite(tenantId);
    const plan = tenantRow.plan as TenantPlan;
    if (planIncludesCatalogApi(plan)) return this.catalogApiAddonOf(plan, sub);
    // La cortesía la decide Administración; el comercio al prender o apagar no la toca.
    const courtesy = enabled ? (opts.courtesy ?? sub.catalogApiAddonCourtesy) : false;
    if (sub.catalogApiAddon === enabled && sub.catalogApiAddonCourtesy === courtesy) return this.catalogApiAddonOf(plan, sub);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          catalogApiAddon: enabled,
          catalogApiAddonCourtesy: courtesy,
          catalogApiAddonSince: enabled ? (sub.catalogApiAddon ? sub.catalogApiAddonSince : new Date()) : null,
        },
      });
      await this.event(tx, sub, actor, enabled ? "ADDON_ENABLED" : "ADDON_DISABLED", {
        data: { addon: "catalogApi", priceUsd: courtesy ? 0 : CATALOG_API_ADDON_PRICE_USD, courtesy, monthly: this.totalOf(plan, row) },
      });
      await this.audit(tx, actor, tenantId, enabled ? "SUBSCRIPTION_ADDON_ENABLED" : "SUBSCRIPTION_ADDON_DISABLED", { addon: "catalogApi" });
      return row;
    });
    if (opts.fromTenant) {
      const who = await inboxRequester(this.prisma, opts.fromTenant);
      void this.inbox?.record({
        ...who,
        type: "PLAN_REQUEST",
        title: `${who.company} ${enabled ? "activó" : "desactivó"} la API de catálogo`,
        data: {
          Módulo: "API de catálogo",
          Precio: updated.catalogApiAddonCourtesy ? "De cortesía (sin cargo)" : `US$ ${CATALOG_API_ADDON_PRICE_USD}/mes`,
          "Cuota nueva": `US$ ${this.totalOf(plan, updated)}/mes`,
          Plan: TENANT_PLAN_LABELS[plan],
        },
      });
    }
    return this.catalogApiAddonOf(plan, updated);
  }

  /** Pagar o correr la fecha levanta una suspensión por deuda; una manual solo con "Reactivar". */
  private liftOverdueSuspension(sub: SubscriptionRow): Prisma.SubscriptionUpdateInput {
    if (sub.status === "SUSPENDED" && sub.suspensionReason === "OVERDUE") {
      return { status: "ACTIVE", suspendedAt: null, suspensionReason: null };
    }
    return {};
  }

  /**
   * Cambiar de plan nunca desconecta nada. Al bajar a un tope, quedan activos en
   * búsqueda los que ya estaban activos y se usaron más recientemente; el resto
   * sale del buscador y sigue conectado. Al subir a sin tope, vuelven todos.
   */
  private async searchOnPlanChange(tx: Tx, tenantId: string, fromMax: number | null, toMax: number | null) {
    if (toMax == null) {
      if (fromMax != null) {
        await tx.providerSyncConfig.updateMany({
          where: { tenantId, includeInSearch: false },
          data: { includeInSearch: null, includeInSearchAt: null },
        });
      }
      return;
    }
    if (fromMax != null && fromMax <= toMax) return;
    const visibles = (await this.visibility.listFor(tenantId)).filter((v) => v.linked && !v.platformHidden);
    if (visibles.length <= toMax) return;
    const lastOrders = await tx.providerOrder.groupBy({
      by: ["provider"],
      where: { tenantId },
      _max: { createdAt: true },
    });
    const lastUsed = new Map(lastOrders.map((o) => [o.provider, o._max.createdAt]));
    const keep = pickSearchProvidersOnDowngrade(
      visibles.map((v) => ({
        provider: v.provider,
        name: v.name,
        currentlyInSearch: v.inSearch,
        lastUsedAt: lastUsed.get(v.provider) ?? null,
      })),
      toMax
    );
    const keepSet = new Set(keep);
    const base = Date.now();
    for (const v of visibles) {
      const index = keep.indexOf(v.provider);
      const enabled = keepSet.has(v.provider);
      const at = new Date(base + Math.max(index, 0));
      await tx.providerSyncConfig.upsert({
        where: { tenantId_provider: { tenantId, provider: v.provider } },
        create: { tenantId, provider: v.provider, includeInSearch: enabled, includeInSearchAt: at },
        update: { includeInSearch: enabled, includeInSearchAt: at },
      });
    }
  }

  private async event(
    tx: Tx,
    sub: SubscriptionRow,
    actor: SubscriptionActor,
    type: string,
    extra: {
      fromStatus?: SubscriptionStatus;
      toStatus?: SubscriptionStatus;
      fromPlan?: TenantPlan;
      toPlan?: TenantPlan;
      data?: Record<string, unknown>;
    } = {}
  ) {
    await tx.subscriptionEvent.create({
      data: {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        type,
        fromStatus: extra.fromStatus,
        toStatus: extra.toStatus,
        fromPlan: extra.fromPlan,
        toPlan: extra.toPlan,
        actorUserId: actor.userId,
        data: (extra.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private async audit(tx: Tx, actor: SubscriptionActor, tenantId: string, action: string, changes: Record<string, unknown>) {
    if (!actor.userId) return;
    await tx.auditLogEntry.create({
      data: {
        entityType: "Subscription",
        entityId: tenantId,
        action,
        performedById: actor.userId,
        changes: changes as Prisma.InputJsonValue,
      },
    });
  }

  private toView(
    tenantRow: { id: string; name: string; plan: string },
    sub: SubscriptionRow | null,
    now = new Date()
  ): SubscriptionView {
    const plan = (isTenantPlan(tenantRow.plan) ? tenantRow.plan : "PRO") as TenantPlan;
    const state = computeSubscriptionState(sub ? toSubscriptionDates(sub) : null, now);
    const entitlements = resolveEntitlements({
      tenantType: "RETAILER",
      plan,
      subscription: sub ? toSubscriptionDates(sub) : null,
      now,
    });
    const listPrice = PLAN_CATALOG[plan].monthlyPrice;
    const setupStatus = (sub?.setupFeeStatus ?? "NOT_APPLICABLE") as SetupFeeStatus;
    return {
      tenantId: tenantRow.id,
      tenantName: tenantRow.name,
      plan,
      planLabel: PLAN_CATALOG[plan].label,
      price: this.priceOf(plan, sub),
      monthlyTotal: this.totalOf(plan, sub),
      addons: { catalogApi: this.catalogApiAddonOf(plan, sub) },
      catalogApiAddon: this.catalogApiAddonOf(plan, sub),
      listPrice,
      priceOverridden: sub?.priceOverride != null,
      currency: sub?.currency ?? "USD",
      status: state.status,
      statusLabel: SUBSCRIPTION_STATUS_LABELS[state.status],
      access: state.access,
      startedAt: iso(sub?.startedAt),
      currentPeriodStart: iso(sub?.currentPeriodStart),
      currentPeriodEnd: iso(sub?.currentPeriodEnd),
      nextBillingAt: iso(sub?.nextBillingAt ?? sub?.currentPeriodEnd),
      dueAt: iso(state.dueAt),
      suspendsAt: iso(state.suspendsAt),
      daysUntilDue: state.daysUntilDue,
      daysOverdue: state.daysOverdue,
      trialEndsAt: iso(sub?.trialEndsAt),
      cancelledAt: iso(sub?.cancelledAt),
      setupFee: {
        amount: num(sub?.setupFee) ?? (plan === "CUSTOM" ? PLAN_CATALOG.CUSTOM.setupFee : null),
        status: setupStatus,
        statusLabel: SETUP_FEE_STATUS_LABELS[setupStatus],
        paidAt: iso(sub?.setupFeePaidAt),
        blocksCustom: Boolean(sub?.setupFeeBlocksCustom),
      },
      capabilities: entitlements.capabilities,
    };
  }

  private toAdminView(
    tenantRow: { id: string; name: string; plan: string; active: boolean; createdAt: Date },
    sub:
      | (SubscriptionRow & {
          payments?: { amount: Prisma.Decimal; paidAt: Date | null; provider: string; status?: string }[];
          events?: { type: string; toPlan: string | null; createdAt: Date; data: Prisma.JsonValue }[];
        })
      | null,
    now = new Date()
  ): AdminSubscriptionView {
    const view = this.toView(tenantRow, sub, now);
    const events = sub?.events ?? [];
    const lastChange = events.find((e) => e.type === "PLAN_CHANGED");
    const lastPaid = events.find((e) => e.type === "PAYMENT_RECORDED");
    const request = events.find((e) => REQUEST_EVENTS.includes(e.type));
    const notice = events.find((e) => e.type === "PAYMENT_NOTICE");
    const paid = sub?.payments?.find((p) => !p.status || p.status === "PAID");
    return {
      ...view,
      storedStatus: (sub?.status ?? "ACTIVE") as SubscriptionStatus,
      courtesy: {
        active: sub?.status === "COURTESY",
        until: iso(sub?.courtesyUntil),
        reason: sub?.courtesyReason ?? null,
      },
      suspensionReason: sub?.suspensionReason ?? null,
      cancellationReason: sub?.cancellationReason ?? null,
      notes: sub?.notes ?? null,
      gracePeriodEnd: iso(sub?.gracePeriodEnd),
      lastPayment: paid ? { amount: Number(paid.amount), paidAt: iso(paid.paidAt), provider: paid.provider } : null,
      pendingRequest:
        request && (!lastChange || request.createdAt > lastChange.createdAt)
          ? {
              plan: isTenantPlan(request.toPlan) ? request.toPlan : null,
              at: request.createdAt.toISOString(),
              message: ((request.data as { message?: string } | null)?.message ?? null) || null,
            }
          : null,
      paymentNoticeAt: notice && (!lastPaid || notice.createdAt > lastPaid.createdAt) ? notice.createdAt.toISOString() : null,
      tenantActive: tenantRow.active,
      createdAt: tenantRow.createdAt.toISOString(),
    };
  }
}

export function matchesFilter(
  row: Pick<SubscriptionView, "status" | "daysUntilDue" | "access">,
  filter: AdminSubscriptionFilter,
  policy = SUBSCRIPTION_POLICY
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return row.status === "ACTIVE" || row.status === "TRIAL";
    case "upcoming":
      return (
        row.daysUntilDue != null &&
        row.daysUntilDue <= policy.upcomingWindowDays &&
        ["ACTIVE", "TRIAL", "COURTESY"].includes(row.status)
      );
    case "past_due":
      return row.status === "PAST_DUE";
    case "grace":
      return row.status === "GRACE_PERIOD";
    case "suspended":
      return row.status === "SUSPENDED";
    case "courtesy":
      return row.status === "COURTESY";
    case "cancelled":
      return row.status === "CANCELLED";
    default:
      return true;
  }
}
