import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { cronsAreGloballyEnabled } from "../common/cron-window";
import { CartService } from "./cart.service";

/** Cada cuánto se buscan pedidos recién creados para sacarlos del carrito. */
const RECONCILE_EVERY_MS = 15_000;

/**
 * Los pedidos pueden terminar en segundo plano, a cualquier hora: por eso
 * corre todo el día (no respeta el horario de los crons de sincronización),
 * salvo con CRON_DISABLED o en staging.
 */
@Injectable()
export class CartOrderReconcileScheduler {
  private readonly logger = new Logger(CartOrderReconcileScheduler.name);
  private running = false;

  constructor(private readonly cart: CartService) {}

  @Interval(RECONCILE_EVERY_MS)
  async tick() {
    if (this.running || !cronsAreGloballyEnabled()) return;
    this.running = true;
    try {
      const done = await this.cart.reconcileOrders();
      if (done > 0) this.logger.log(`Carrito: ${done} pedido(s) creados descontados del carrito compartido`);
    } catch (err) {
      this.logger.error(`No se pudo descontar pedidos del carrito: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
