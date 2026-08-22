import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ElitWebClient } from "./elit-web-client";
import { parseElitCtaRsc, parseElitPedidosRsc } from "./elit-rsc.parser";

/**
 * Cuenta de Elit: login del portal + RSC de /mi-cuenta/pedidos y
 * /mi-cuenta/cuenta-corriente (los JSON de pedidos/cta cte no tienen
 * collection REST pública; el sitio los manda en el payload RSC).
 */
@Injectable()
export class ElitAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(userId: string, credentials: Record<string, string>) {
    const api = await ElitWebClient.login(credentials);
    const [pedidos, cta, drafts] = await Promise.all([
      api.getRsc("/mi-cuenta/pedidos"),
      api.getRsc("/mi-cuenta/cuenta-corriente"),
      this.prisma.providerOrder.findMany({
        where: { userId, provider: "ELIT" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    const orders = parseElitPedidosRsc(pedidos);
    const statement = parseElitCtaRsc(cta);
    return {
      profile: {
        id: api.session.customerId,
        name: api.session.name,
        exchange: api.session.currentExchange,
      },
      balance: statement.balance,
      orders,
      movements: statement.movements,
      drafts,
      note: "Pedidos y comprobantes de tu cuenta en elit.com.ar. Solo lectura.",
    };
  }
}
