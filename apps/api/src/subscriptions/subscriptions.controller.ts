import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { JwtPayload } from "@nodo/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AllowWhenRestricted } from "../tenants/entitlements";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import {
  AdminSubscriptionsQueryDto,
  BillingDateDto,
  ChangePlanDto,
  CourtesyDto,
  EndCourtesyDto,
  ExtendDto,
  NotesDto,
  PaymentNoticeDto,
  PlanRequestDto,
  ReactivateDto,
  ReasonDto,
  RegisterPaymentDto,
  SetupFeeDto,
} from "./dto/subscription.dto";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * "Plan y facturación" del comercio (Tipo 1). Todo sigue andando con la
 * suscripción suspendida: es justamente desde acá que se regulariza.
 */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@AllowWhenRestricted()
@Controller("my/subscription")
export class MySubscriptionController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  mine(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptions.mine(tenant);
  }

  /** Base → Pro al instante; el resto queda como solicitud. OWNER/ADMIN o `team.manage`. */
  @Post("upgrade")
  upgrade(@CurrentTenant() tenant: TenantContext, @Body() dto: PlanRequestDto) {
    return this.subscriptions.upgradeMine(tenant, dto);
  }

  @Post("request")
  request(@CurrentTenant() tenant: TenantContext, @Body() dto: PlanRequestDto) {
    return this.subscriptions.request(tenant, dto);
  }

  @Post("payment-notice")
  paymentNotice(@CurrentTenant() tenant: TenantContext, @Body() dto: PaymentNoticeDto) {
    return this.subscriptions.paymentNotice(tenant, dto);
  }
}

/** Módulo SUSCRIPCIONES del superadmin. Solo ROLE_ADMIN en su propia sesión. */
@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/subscriptions")
export class AdminSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  list(@Query() query: AdminSubscriptionsQueryDto) {
    return this.subscriptions.adminList(query.filter ?? "all", query.q);
  }

  @Get(":tenantId")
  detail(@Param("tenantId") tenantId: string) {
    return this.subscriptions.adminDetail(tenantId);
  }

  @Put(":tenantId/plan")
  changePlan(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: ChangePlanDto) {
    return this.subscriptions.changePlan({ userId: user.userId }, tenantId, dto);
  }

  @Post(":tenantId/payments")
  registerPayment(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: RegisterPaymentDto) {
    return this.subscriptions.registerPayment({ userId: user.userId }, tenantId, dto);
  }

  @Put(":tenantId/billing-date")
  billingDate(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: BillingDateDto) {
    return this.subscriptions.setBillingDate({ userId: user.userId }, tenantId, dto.nextBillingAt);
  }

  @Post(":tenantId/extend")
  extend(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: ExtendDto) {
    return this.subscriptions.extend({ userId: user.userId }, tenantId, dto.days, dto.reason);
  }

  @Put(":tenantId/courtesy")
  setCourtesy(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: CourtesyDto) {
    return this.subscriptions.setCourtesy({ userId: user.userId }, tenantId, dto);
  }

  @Delete(":tenantId/courtesy")
  endCourtesy(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: EndCourtesyDto) {
    return this.subscriptions.endCourtesy({ userId: user.userId }, tenantId, dto);
  }

  @Post(":tenantId/suspend")
  suspend(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: ReasonDto) {
    return this.subscriptions.suspend({ userId: user.userId }, tenantId, dto.reason);
  }

  @Post(":tenantId/reactivate")
  reactivate(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: ReactivateDto) {
    return this.subscriptions.reactivate({ userId: user.userId }, tenantId, dto.nextBillingAt);
  }

  @Post(":tenantId/cancel")
  cancel(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: ReasonDto) {
    return this.subscriptions.cancel({ userId: user.userId }, tenantId, dto.reason);
  }

  @Put(":tenantId/notes")
  notes(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: NotesDto) {
    return this.subscriptions.setNotes({ userId: user.userId }, tenantId, dto.notes);
  }

  @Put(":tenantId/setup-fee")
  setupFee(@CurrentUser() user: JwtPayload, @Param("tenantId") tenantId: string, @Body() dto: SetupFeeDto) {
    return this.subscriptions.setSetupFee({ userId: user.userId }, tenantId, dto);
  }
}
