import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SolutionBoxWebClient } from "./solution-box-web-client";
import { mapSolutionBoxOrder, mapSolutionBoxOrders } from "./solution-box.parser";
import { mapProviderDraft } from "./provider-draft";
import { documentFile } from "./document-file";

const ORDERS_PAGE = 50;
const ORDER_NUMBER = /^\d{1,12}$/;
const ORDER_EXT = /^[A-Za-z0-9]{1,4}$/;

/**
 * Pedidos y facturas de Solution Box (API interna del sitio). El sitio no expone
 * cuenta corriente: lo que hay es el historial de pedidos con su factura en PDF.
 */
@Injectable()
export class SolutionBoxAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(tenantId: string, credentials: Record<string, string>) {
    const api = await SolutionBoxWebClient.login(credentials);
    const c = api.customer;
    const [ordersBody, drafts] = await Promise.all([
      api.get(`/pedidos/ordenes/cliente/${c.customerId}`, { Limit: ORDERS_PAGE, Offset: 0 }),
      this.prisma.providerOrder.findMany({
        where: { tenantId, provider: "SOLUTION_BOX" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    const orders = mapSolutionBoxOrders(ordersBody);
    return {
      profile: {
        id: String(c.customerId),
        name: c.companyName || `${c.name} ${c.lastName}`.trim(),
        email: c.email,
        cuit: c.cuit,
        exchange: c.exchange,
        paymentCondition: c.paymentCondition?.label ?? null,
        deliveryType: c.deliveryType?.label ?? null,
      },
      orders,
      invoices: orders.filter((o) => o.invoice),
      drafts: drafts.map(mapProviderDraft),
      note: "Pedidos y facturas de solutionbox.com.ar. El sitio no publica cuenta corriente: el saldo lo informa tu vendedor.",
    };
  }

  async getOrder(credentials: Record<string, string>, number: string, ext: string) {
    this.assertRef(number, ext);
    const api = await SolutionBoxWebClient.login(credentials);
    const order = mapSolutionBoxOrder(await api.get(`/pedidos/orden/${number}/${ext}`));
    if (!order) throw new NotFoundException("Pedido no encontrado en Solution Box");
    return order;
  }

  async getInvoice(credentials: Record<string, string>, number: string, ext: string) {
    this.assertRef(number, ext);
    const api = await SolutionBoxWebClient.login(credentials);
    const file = await api.getBuffer(`/pedidos/orden/factura/${number}/${ext}`);
    return documentFile(file.buffer, file.contentType, `factura-solutionbox-${number}-${ext}`);
  }

  private assertRef(number: string, ext: string) {
    if (!ORDER_NUMBER.test(number) || !ORDER_EXT.test(ext)) throw new BadRequestException("Referencia de pedido inválida");
  }
}
