import { BadRequestException, Injectable } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import { CredentialsService } from "../credentials/credentials.service";
import { AirOrderService, type AirDraftInput } from "../providers/air-order.service";
import { ElitOrderService, type ElitCartItems } from "../providers/elit-order.service";
import { GrupoNucleoOrderService, type GnDraftInput } from "../providers/grupo-nucleo-order.service";
import { InvidOrderService, type InvidDraftInput } from "../providers/invid-order.service";
import { NewBytesOrderService, type NewBytesDraftInput } from "../providers/new-bytes-order.service";
import type { OrderAuthor } from "../providers/provider-draft";
import type { TenantContext } from "../tenants/tenant-context.service";
import { OrderApprovalService } from "./order-approval.service";

/**
 * Aprobar un pedido es mandarlo al proveedor con los mismos datos con los que lo
 * armó el vendedor: el borrador guardado se reenvía tal cual, sin editarlo por el
 * camino, y la fila que ya existía se completa con el resultado.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly approval: OrderApprovalService,
    private readonly credentials: CredentialsService,
    private readonly invid: InvidOrderService,
    private readonly newBytes: NewBytesOrderService,
    private readonly grupoNucleo: GrupoNucleoOrderService,
    private readonly air: AirOrderService,
    private readonly elit: ElitOrderService
  ) {}

  list(tenant: TenantContext) {
    return this.approval.list(tenant);
  }

  pending(tenant: TenantContext) {
    return this.approval.list(tenant, { pendientes: true });
  }

  reject(tenant: TenantContext, userId: string, id: string, reason?: string) {
    return this.approval.reject(tenant, userId, id, reason);
  }

  async approve(tenant: TenantContext, userId: string, id: string) {
    const order = await this.approval.assertApprovable(tenant, id);
    const provider = order.provider as Provider;
    const credentials = await this.credentialsOf(tenant, provider);
    // El pedido lo sigue firmando quien lo armó; queda registrado quién lo aprobó.
    const author: OrderAuthor = { userId: order.userId, tenantId: tenant.tenantId };
    const input = order.draftInput as Record<string, unknown>;

    const resultado = await this.send(provider, author, credentials, input, order.id);
    await this.approval.markApproved(order.id, userId);
    return resultado;
  }

  private send(
    provider: Provider,
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: Record<string, unknown>,
    orderId: string
  ) {
    switch (provider) {
      case "INVID":
        return this.invid.approveDraft(author, credentials, input as unknown as InvidDraftInput, orderId);
      case "NEW_BYTES":
        return this.newBytes.approveDraft(author, credentials, input as unknown as NewBytesDraftInput, orderId);
      case "GRUPO_NUCLEO":
        return this.grupoNucleo.approveDraft(author, credentials, input as unknown as GnDraftInput, orderId);
      case "AIR":
        return this.air.approveDraft(author, credentials, input as unknown as AirDraftInput, orderId);
      case "ELIT":
        return this.elit.approveDraft(author, credentials, input as unknown as ElitCartItems, orderId);
      default:
        throw new BadRequestException(`Todavía no se pueden aprobar pedidos de ${provider} desde Nodo`);
    }
  }

  private async credentialsOf(tenant: TenantContext, provider: Provider) {
    const stored = await this.credentials.getByProvider(tenant.tenantId, provider);
    return JSON.parse(stored.credentialsJson) as Record<string, string>;
  }
}
