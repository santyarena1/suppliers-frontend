import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { type Provider, providerLabel } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialsService } from "../credentials/credentials.service";
import { NewBytesAccountService } from "./new-bytes-account.service";
import { InvidAccountService } from "./invid-account.service";
import { NewTreeAccountService } from "./new-tree-account.service";
import { SolutionBoxAccountService } from "./solution-box-account.service";
import { ElitWebClient } from "./elit-web-client";
import { parseElitSaleNotesPayload } from "./elit-rsc.parser";
import { PolytechClient } from "./polytech-client";
import {
  TRACKED_PROVIDERS,
  advances,
  bestUpdate,
  portalValue,
  trackingNotice,
  type PortalOrderStatus,
  type TrackingStage,
  type TrackingUpdate,
} from "./order-tracking";

/** Se siguen los pedidos de los últimos 90 días que todavía no se entregaron ni se anularon. */
const TRACK_DAYS = 90;
/** «Actualizar estados» desde Pedidos: una vez por minuto por comercio. */
const MANUAL_EVERY_MS = 60_000;
/** Un pedido con más de 12 h que NODO lee por primera vez no avisa (ver apply). */
const BACKFILL_AFTER_MS = 12 * 3_600_000;

type OpenOrder = {
  id: string;
  tenantId: string;
  provider: string;
  invidOrderNumber: string | null;
  invidWebOrderNumber: string | null;
  trackingStage: string | null;
  trackingStatus: string | null;
  trackingInvoice: string | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingHistory: Prisma.JsonValue;
  trackingCheckedAt: Date | null;
  createdAt: Date;
};

const POLYTECH_STAGE: Record<string, TrackingStage> = { pending: "SENT", in_process: "CONFIRMED", shipped: "SHIPPED" };

function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Un código suelto ("1", "2") no es un estado que se pueda mostrar. */
function statusText(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s && !/^\d+$/.test(s) ? s : null;
}

/** Nota de venta de Elit (/account/salenotes) → fila de seguimiento. */
export function elitTrackingRow(n: {
  internalNumber?: string | null;
  orderNumber?: string | null;
  status?: string | null;
  statusDescription?: string | null;
  trackingStatus?: string | null;
  dispatchNote?: string | null;
  invoiceNumber?: string | null;
  tracking?: string | null;
  trackingSupplier?: string | null;
}): PortalOrderStatus {
  return {
    numbers: [n.internalNumber, n.orderNumber],
    status: n.status,
    // El remito sale cuando lo despachan (sin remito Elit manda «0»).
    hints: [n.statusDescription, n.trackingStatus, portalValue(n.dispatchNote) ? "remitido" : null],
    invoice: n.invoiceNumber,
    trackingNumber: n.tracking,
    carrier: n.trackingSupplier,
  };
}

/** Fila de lista_pedidos_invid.php → fila de seguimiento. */
export function invidTrackingRow(o: { webOrderNumber?: string | null; orderNumber?: string | null; status?: string | null; invoice?: string | null }): PortalOrderStatus {
  return { numbers: [o.webOrderNumber, o.orderNumber], status: o.status, invoice: o.invoice };
}

/**
 * Seguimiento de los pedidos que NODO mandó a cada distribuidor: lee el listado de
 * pedidos de su portal con la cuenta del comercio, cruza por número y, si la etapa
 * avanzó (confirmado, facturado, despachado, entregado o anulado), la guarda y deja
 * un aviso en «Avisos». La web lo muestra en Pedidos y avisa con un cartel.
 */
@Injectable()
export class OrderTrackingService {
  private readonly logger = new Logger(OrderTrackingService.name);
  private readonly manualAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly newBytes: NewBytesAccountService,
    private readonly invid: InvidAccountService,
    private readonly newTree: NewTreeAccountService,
    private readonly solutionBox: SolutionBoxAccountService
  ) {}

  /** Todos los comercios (lo llama el scheduler). */
  async refreshAll(): Promise<{ checked: number; changed: number }> {
    return this.refresh({});
  }

  /**
   * Un comercio, desde «Actualizar estados». Si se pidió hace menos de un minuto no
   * vuelve a entrar a los portales.
   */
  async refreshTenant(tenantId: string): Promise<{ checked: number; changed: number; skipped?: boolean }> {
    const last = this.manualAt.get(tenantId) ?? 0;
    if (Date.now() - last < MANUAL_EVERY_MS) return { checked: 0, changed: 0, skipped: true };
    this.manualAt.set(tenantId, Date.now());
    return this.refresh({ tenantId });
  }

  private async refresh(where: { tenantId?: string }): Promise<{ checked: number; changed: number }> {
    const orders = await this.prisma.providerOrder.findMany({
      where: {
        ...where,
        provider: { in: [...TRACKED_PROVIDERS] },
        status: "CREATED",
        createdAt: { gte: new Date(Date.now() - TRACK_DAYS * 86_400_000) },
        OR: [{ trackingStage: null }, { trackingStage: { notIn: ["DELIVERED", "CANCELLED"] } }],
      },
      select: {
        id: true,
        tenantId: true,
        provider: true,
        invidOrderNumber: true,
        invidWebOrderNumber: true,
        trackingStage: true,
        trackingStatus: true,
        trackingInvoice: true,
        trackingNumber: true,
        trackingCarrier: true,
        trackingHistory: true,
        trackingCheckedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    const groups = new Map<string, OpenOrder[]>();
    for (const o of orders) {
      const key = `${o.tenantId}|${o.provider}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    let checked = 0;
    let changed = 0;
    // De a un portal por vez: son cuentas reales de los comercios.
    for (const [key, list] of groups) {
      const [tenantId, provider] = key.split("|");
      try {
        const rows = await this.portalRows(tenantId, provider as Provider, list);
        if (rows == null) {
          this.logger.log(`Seguimiento ${provider} de ${tenantId}: sin cuenta cargada (${list.length} pedidos)`);
          continue;
        }
        let found = 0;
        for (const order of list) {
          checked += 1;
          const update = bestUpdate(order, rows);
          if (update) found += 1;
          if (await this.apply(order, update)) changed += 1;
        }
        // Para revisar el cruce: números de NODO contra los del portal y los estados que vienen.
        const sample = (xs: unknown[]) => JSON.stringify(xs.slice(0, 6));
        this.logger.log(
          `Seguimiento ${provider} de ${tenantId}: ${rows.length} filas en el portal, ${found}/${list.length} pedidos encontrados` +
            (found < list.length
              ? ` · NODO ${sample(list.map((o) => [o.invidOrderNumber, o.invidWebOrderNumber]))} · portal ${sample(rows.map((r) => r.numbers))}`
              : "") +
            ` · estados ${sample([...new Set(rows.map((r) => r.status).filter(Boolean))])}`
        );
      } catch (err) {
        this.logger.warn(`Seguimiento ${provider} de ${tenantId}: ${msg(err)}`);
      }
    }
    return { checked, changed };
  }

  /** Las credenciales viven en el comercio real (una organización espejo usa las de ese). */
  private async credentialsFor(tenantId: string, provider: Provider): Promise<Record<string, string> | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { mirrorsCommercialFromId: true } });
    const stored = await this.credentials.findByProvider(tenant?.mirrorsCommercialFromId ?? tenantId, provider);
    return stored ? (JSON.parse(stored.credentialsJson) as Record<string, string>) : null;
  }

  /** El listado de pedidos del portal, llevado a filas comunes. `null`: sin cuenta cargada. */
  private async portalRows(tenantId: string, provider: Provider, orders: OpenOrder[]): Promise<PortalOrderStatus[] | null> {
    const creds = await this.credentialsFor(tenantId, provider);
    if (!creds) return null;
    switch (provider) {
      case "NEW_BYTES":
        return this.newBytesRows(creds, orders);
      case "ELIT": {
        const api = await ElitWebClient.login(creds);
        const body = await api.proxyGet("/account/salenotes?limit=50&sortBy=number:desc");
        return parseElitSaleNotesPayload(body).map(elitTrackingRow);
      }
      case "INVID": {
        const { orders: rows } = await this.invid.getOrders(creds);
        return rows.map(invidTrackingRow);
      }
      case "NEW_TREE": {
        const from = new Date(Date.now() - (TRACK_DAYS + 5) * 86_400_000);
        const account = await this.newTree.getAccount(tenantId, creds, { from: yyyymmdd(from) });
        return account.orders.map((o) => ({ numbers: [o.id], status: o.status }));
      }
      case "SOLUTION_BOX": {
        const account = await this.solutionBox.getAccount(tenantId, creds);
        return account.orders.map((o) => ({
          numbers: [o.number, `${o.number}/${o.extension}`],
          status: o.status,
          invoice: o.invoice,
        }));
      }
      case "POLYTECH": {
        const api = await PolytechClient.fromCredentials(creds);
        const rows = await api.orderHistory();
        return rows.map((o) => ({ numbers: [o.id], stage: POLYTECH_STAGE[o.bucket] ?? "SENT" }));
      }
      default:
        return null;
    }
  }

  /**
   * New Bytes: órdenes de compra (las que crea el checkout) y pedidos. De las
   * órdenes de NODO que siguen abiertas se lee además su seguimiento («En preparación»…).
   */
  private async newBytesRows(creds: Record<string, string>, orders: OpenOrder[]): Promise<PortalOrderStatus[]> {
    const [purchase, pedidos] = await Promise.all([
      this.newBytes.getPurchaseOrders(creds),
      this.newBytes.getOrders(creds).catch(() => ({ orders: [] })),
    ]);
    const rows: PortalOrderStatus[] = [...purchase.orders, ...pedidos.orders].map((r) => ({
      numbers: [r.orderNumber, r.webOrderNumber, r.albNumber],
      status: statusText(r.statusDescription) ?? statusText(r.status),
      invoice: r.invoice,
      // `trackingNumber` de New Bytes es un código interno («MIN-000210486513»), no el envío: no se usa.
    }));
    for (const order of orders) {
      // Las órdenes que no entran en el listado (trae unas 80) se abren igual por número; la
      // sucursal sale de la fila o del número web que guardó NODO («0002-10486384»).
      const number = order.invidOrderNumber?.trim();
      if (!number) continue;
      const head = purchase.orders.find((r) => r.orderNumber === number);
      const branch = head?.branch != null ? String(head.branch) : order.invidWebOrderNumber?.match(/^(\d+)-/)?.[1];
      if (!branch) continue;
      const detail = await this.newBytes.getOrderDetail(creds, number, "purchase", branch).catch(() => null);
      const steps = detail && "tracking" in detail ? (detail.tracking ?? []) : [];
      if (steps.length) {
        rows.push({ numbers: [number], status: statusText(steps[steps.length - 1]?.state), hints: steps.map((s) => s.state) });
      } else if (detail?.found) {
        // Está en el portal pero sin seguimiento todavía: queda Enviado.
        rows.push({ numbers: [number], status: null });
      }
    }
    return rows;
  }

  /**
   * Guarda lo nuevo. Devuelve true si la etapa avanzó y dejó el aviso. La primera
   * lectura de un pedido viejo (más de 12 h) es silenciosa: toma su etapa sin aviso
   * ni cartel, así al activar el seguimiento no llegan avisos de pedidos de hace semanas.
   */
  private async apply(order: OpenOrder, update: TrackingUpdate | null): Promise<boolean> {
    const now = new Date();
    if (!update) {
      await this.prisma.providerOrder.update({ where: { id: order.id }, data: { trackingCheckedAt: now } });
      return false;
    }
    const moved = advances(order.trackingStage, update.stage);
    const backfill = order.trackingCheckedAt == null && Date.now() - order.createdAt.getTime() > BACKFILL_AFTER_MS;
    const history = Array.isArray(order.trackingHistory) ? (order.trackingHistory as Prisma.JsonArray) : [];
    await this.prisma.providerOrder.update({
      where: { id: order.id },
      data: {
        trackingCheckedAt: now,
        trackingStatus: update.status ?? order.trackingStatus,
        trackingInvoice: update.invoice ?? order.trackingInvoice,
        trackingNumber: update.trackingNumber ?? order.trackingNumber,
        trackingCarrier: update.carrier ?? order.trackingCarrier,
        ...(moved
          ? {
              trackingStage: update.stage,
              ...(backfill ? {} : { trackingChangedAt: now }),
              trackingHistory: [...history, { stage: update.stage, at: now.toISOString() }],
            }
          : order.trackingStage == null
            ? { trackingStage: "SENT" }
            : {}),
      },
    });
    if (!moved || backfill) return false;
    const notice = trackingNotice(
      providerLabel(order.provider as Provider) ?? order.provider,
      order.invidWebOrderNumber || order.invidOrderNumber,
      { ...update, invoice: update.invoice ?? order.trackingInvoice, trackingNumber: update.trackingNumber ?? order.trackingNumber }
    );
    await this.prisma.orgNotification.create({
      data: { toTenantId: order.tenantId, kind: "SYSTEM", title: notice.title, body: notice.body, landingKey: `order:${order.id}` },
    });
    this.logger.log(`Seguimiento: ${notice.title} (${order.id} → ${update.stage})`);
    return true;
  }

  /** Lo que cambió desde `since` en los pedidos del comercio: la web lo muestra como cartel. */
  async updatesSince(tenantId: string, since: Date) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId, trackingChangedAt: { gt: since } },
      select: {
        id: true,
        provider: true,
        invidOrderNumber: true,
        invidWebOrderNumber: true,
        trackingStage: true,
        trackingStatus: true,
        trackingInvoice: true,
        trackingNumber: true,
        trackingCarrier: true,
        trackingChangedAt: true,
      },
      orderBy: { trackingChangedAt: "asc" },
      take: 20,
    });
    return rows.map((r) => {
      const stage = (r.trackingStage ?? "SENT") as TrackingStage;
      const notice = trackingNotice(providerLabel(r.provider as Provider) ?? r.provider, r.invidWebOrderNumber || r.invidOrderNumber, {
        stage,
        status: r.trackingStatus,
        invoice: r.trackingInvoice,
        trackingNumber: r.trackingNumber,
        carrier: r.trackingCarrier,
      });
      return { id: r.id, provider: r.provider, stage, at: r.trackingChangedAt!.toISOString(), ...notice };
    });
  }
}
