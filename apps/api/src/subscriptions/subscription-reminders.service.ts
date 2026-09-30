import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import {
  computeSubscriptionState,
  reminderDueNow,
  SUBSCRIPTION_REMINDER_COPY,
  type SubscriptionReminderKind,
  type SubscriptionState,
  type SubscriptionStatus,
} from "@nodo/shared";
import { CRON_TZ, shouldRunScheduledJob } from "../common/cron-window";
import { PrismaService } from "../prisma/prisma.service";
import { toSubscriptionDates } from "../tenants/tenant-context.service";

/** Canales de recordatorio. Hoy solo in-app; email/WhatsApp se agregan como otro canal. */
export const REMINDER_CHANNELS = ["IN_APP"] as const;

/** Estados que el cron puede escribir porque salen de las fechas. */
const DATE_DRIVEN: readonly SubscriptionStatus[] = ["ACTIVE", "TRIAL", "COURTESY", "PAST_DUE", "GRACE_PERIOD", "SUSPENDED"];

/**
 * Qué cambiar en la fila guardada para que refleje el estado efectivo.
 * `null` = nada. Nunca toca una suspensión manual ni una cancelación.
 */
export function statusSyncPatch(
  sub: { status: string; suspensionReason: string | null; nextBillingAt: Date | null },
  state: SubscriptionState,
  now: Date
): Prisma.SubscriptionUpdateInput | null {
  if (!DATE_DRIVEN.includes(sub.status as SubscriptionStatus)) return null;
  if (sub.status === "SUSPENDED" && sub.suspensionReason !== "OVERDUE") return null;
  if (sub.status === state.status) return null;
  if (state.status === "PAST_DUE" || state.status === "GRACE_PERIOD") {
    return { status: state.status, nextBillingAt: sub.nextBillingAt ?? state.dueAt };
  }
  if (state.status === "SUSPENDED") {
    return { status: "SUSPENDED", suspendedAt: now, suspensionReason: "OVERDUE", nextBillingAt: sub.nextBillingAt ?? state.dueAt };
  }
  if (state.status === "ACTIVE" && sub.status !== "COURTESY" && sub.status !== "TRIAL") {
    return { status: "ACTIVE", suspendedAt: null, suspensionReason: null };
  }
  return null;
}

/**
 * Vencimientos: deja el estado guardado al día (para listados y reportes) y manda
 * los recordatorios in-app. El estado que manda para operar se calcula en cada
 * request, así que si este cron no corre nadie queda mal suspendido.
 */
@Injectable()
export class SubscriptionRemindersService {
  private readonly logger = new Logger(SubscriptionRemindersService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron("15 * * * *", { timeZone: CRON_TZ })
  async hourly() {
    if (!shouldRunScheduledJob()) return;
    try {
      const result = await this.run();
      if (result.statusChanges || result.reminders) {
        this.logger.log(`Suscripciones: ${result.statusChanges} cambio(s) de estado, ${result.reminders} recordatorio(s)`);
      }
    } catch (err) {
      this.logger.warn(`Suscripciones: el ciclo falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async run(now = new Date()) {
    const subs = await this.prisma.subscription.findMany({
      where: { tenant: { type: "RETAILER", active: true }, status: { not: "CANCELLED" } },
    });
    let statusChanges = 0;
    let reminders = 0;
    for (const sub of subs) {
      const state = computeSubscriptionState(toSubscriptionDates(sub), now);
      const patch = statusSyncPatch(sub, state, now);
      if (patch) {
        await this.prisma.$transaction([
          this.prisma.subscription.update({ where: { id: sub.id }, data: patch }),
          this.prisma.subscriptionEvent.create({
            data: {
              tenantId: sub.tenantId,
              subscriptionId: sub.id,
              type: "STATUS_CHANGED",
              fromStatus: sub.status,
              toStatus: state.status,
              data: { automatic: true, dueAt: state.dueAt?.toISOString() ?? null },
            },
          }),
        ]);
        statusChanges++;
      }
      if (sub.status === "SUSPENDED" && sub.suspensionReason !== "OVERDUE") continue;
      const due = reminderDueNow(state, now);
      if (!due) continue;
      for (const channel of REMINDER_CHANNELS) {
        if (await this.send(sub.id, sub.tenantId, due.kind, due.anchorAt, channel, now)) reminders++;
      }
    }
    return { checked: subs.length, statusChanges, reminders };
  }

  /** Crea el recordatorio si no existía (único por ciclo y canal) y el aviso in-app. */
  private async send(
    subscriptionId: string,
    tenantId: string,
    kind: SubscriptionReminderKind,
    anchorAt: Date,
    channel: string,
    now: Date
  ): Promise<boolean> {
    try {
      await this.prisma.subscriptionReminder.create({
        data: { subscriptionId, tenantId, kind, anchorAt, channel, status: "PENDING" },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
    const copy = SUBSCRIPTION_REMINDER_COPY[kind];
    const note = await this.prisma.orgNotification.create({
      data: {
        toTenantId: tenantId,
        fromTenantId: null,
        kind: "SYSTEM",
        title: copy.title,
        body: copy.body,
        landingKey: `subscription:${kind}`,
      },
    });
    await this.prisma.subscriptionReminder.update({
      where: { subscriptionId_kind_anchorAt_channel: { subscriptionId, kind, anchorAt, channel } },
      data: { status: "SENT", sentAt: now, notificationId: note.id },
    });
    return true;
  }
}
