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
  /** Se aplicó una lista de precios (base o propia) de un proveedor por lista. */
  "list.applied": {
    provider: string;
    level: "BASE" | "TENANT";
    /** Filas crudas de la planilla (encabezado → celda), para lo que el importador no mapea. */
    rows?: { externalId: string; raw: Record<string, unknown> }[];
  };
  /** Un pedido a la tienda de un comercio quedó a la vista de la tienda (creado ya aprobado, o aprobado después). */
  "storefront.order": { orderId: string };
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
