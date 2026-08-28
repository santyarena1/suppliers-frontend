import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { TenantContext } from "../tenants/tenant-context.service";
import { BrandLandingService } from "./brand-landing.service";
import { BrandActionsService } from "./brand-actions.service";
import { BrandOrgsService } from "./brand-orgs.service";
import { BrandNotificationsService } from "./brand-notifications.service";
import { BrandCatalogService } from "./brand-catalog.service";
import { BrandResourcesService } from "./brand-resources.service";
import { BrandHubService } from "./brand-hub.service";
import {
  CreateBrandActionStatusDto,
  ImportBrandSignalsDto,
  PostBrandNoteDto,
  UpsertBrandActionDto,
  UpsertBrandResourceDto,
  UpsertBrandSignalDto,
  UpdateBrandLandingDto,
} from "./dto/brand.dto";

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/brand")
export class BrandPanelController {
  constructor(
    private readonly landing: BrandLandingService,
    private readonly actions: BrandActionsService,
    private readonly notes: BrandNotificationsService,
    private readonly catalog: BrandCatalogService,
    private readonly resources: BrandResourcesService
  ) {}

  @Get("landing")
  getLanding(@CurrentTenant() tenant: TenantContext) {
    return this.landing.getMine(tenant);
  }

  @Put("landing")
  putLanding(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateBrandLandingDto) {
    return this.landing.updateMine(tenant, dto);
  }

  @Get("catalog")
  catalogSearch(
    @CurrentTenant() tenant: TenantContext,
    @Query("q") q = "",
    @Query("provider") provider?: string,
    @Query("take") take?: string
  ) {
    return this.catalog.searchCatalog(tenant, q, provider, take ? Number(take) : 40);
  }

  @Get("signals")
  listSignals(@CurrentTenant() tenant: TenantContext) {
    return this.catalog.listSignals(tenant);
  }

  @Put("signals")
  upsertSignal(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertBrandSignalDto) {
    return this.catalog.upsertSignal(tenant, dto);
  }

  @Delete("signals/:id")
  removeSignal(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.catalog.removeSignal(tenant, id);
  }

  @Post("signals/import")
  importSignals(@CurrentTenant() tenant: TenantContext, @Body() dto: ImportBrandSignalsDto) {
    return this.catalog.importCsv(tenant, dto.csv);
  }

  @Get("resources")
  listResources(@CurrentTenant() tenant: TenantContext, @Query("kind") kind?: "MATERIAL" | "TRAINING") {
    return this.resources.list(tenant, kind);
  }

  @Post("resources")
  createResource(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertBrandResourceDto) {
    return this.resources.create(tenant, dto);
  }

  @Delete("resources/:id")
  removeResource(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.resources.remove(tenant, id);
  }

  @Get("actions")
  listActions(@CurrentTenant() tenant: TenantContext) {
    return this.actions.list(tenant);
  }

  @Post("actions")
  createAction(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertBrandActionDto) {
    return this.actions.create(tenant, dto);
  }

  @Get("actions/:id")
  getAction(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.actions.get(tenant, id);
  }

  @Put("actions/:id")
  updateAction(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body() dto: UpsertBrandActionDto
  ) {
    return this.actions.update(tenant, id, dto);
  }

  @Post("actions/:id/status")
  setStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body() dto: CreateBrandActionStatusDto
  ) {
    return this.actions.setStatus(tenant, id, dto.status);
  }

  @Get("accounts")
  accounts(@CurrentTenant() tenant: TenantContext) {
    return this.actions.accounts(tenant);
  }

  @Post("notes")
  note(@CurrentTenant() tenant: TenantContext, @Body() dto: PostBrandNoteDto) {
    return this.notes.sendToRetailer(tenant, dto);
  }
}

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/brands")
export class RetailerBrandsController {
  constructor(
    private readonly actions: BrandActionsService,
    private readonly hub: BrandHubService
  ) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.actions.visibleToClient(tenant);
  }

  @Get(":linkId")
  hubFor(@CurrentTenant() tenant: TenantContext, @Param("linkId") linkId: string) {
    return this.hub.getForClient(tenant, linkId);
  }
}

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/notifications")
export class OrgNotificationsController {
  constructor(private readonly notes: BrandNotificationsService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.notes.listMine(tenant);
  }

  @Post(":id/read")
  read(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.notes.markRead(tenant, id);
  }

  @Post("send")
  send(@CurrentTenant() tenant: TenantContext, @Body() dto: PostBrandNoteDto) {
    return this.notes.sendToRetailer(tenant, dto);
  }
}

@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/brands")
export class AdminBrandsController {
  constructor(private readonly orgs: BrandOrgsService) {}

  @Post("sync")
  sync() {
    return this.orgs.syncCatalogBrands();
  }
}
