import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { shouldRunScheduledJob } from "../common/cron-window";
import { OrderTrackingService } from "./order-tracking.service";

/** Cada cuánto se miran los portales. */
const TRACK_EVERY_MS = 15 * 60_000;

/** Seguimiento de pedidos en horario de crons (06–23 AR): de noche los distribuidores no facturan. */
@Injectable()
export class OrderTrackingScheduler {
  private readonly logger = new Logger(OrderTrackingScheduler.name);
  private running = false;

  constructor(private readonly tracking: OrderTrackingService) {}

  @Interval(TRACK_EVERY_MS)
  async tick() {
    if (this.running || !shouldRunScheduledJob()) return;
    this.running = true;
    try {
      const { checked, changed } = await this.tracking.refreshAll();
      if (checked > 0) this.logger.log(`Seguimiento de pedidos: ${checked} revisados, ${changed} avanzaron`);
    } catch (err) {
      this.logger.error(`Seguimiento de pedidos: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
