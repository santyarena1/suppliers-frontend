import { EventEmitter } from "node:events";

/**
 * Eventos de dominio en proceso. Sirven para que un módulo reaccione a algo que
 * pasó en otro sin importarlo (y sin ciclos de dependencias entre módulos Nest).
 *
 * Es un EventEmitter común: si el proceso se cae, el evento se pierde. Todo lo
 * que se dispare desde acá tiene que tener además un camino de reconciliación
 * (un cron, una verificación al leer) para que no dependa del evento.
 */
export interface DomainEvents {
  /** Un comercio quedó vinculado (ACTIVE) con un distribuidor o marca. */
  "tenant.linked": { clientTenantId: string; supplierTenantId: string; provider: string | null };
}

class TypedEmitter {
  private readonly emitter = new EventEmitter();

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DomainEvents>(event: K, handler: (payload: DomainEvents[K]) => void): () => void {
    this.emitter.on(event, handler);
    return () => this.emitter.off(event, handler);
  }
}

export const domainEvents = new TypedEmitter();
