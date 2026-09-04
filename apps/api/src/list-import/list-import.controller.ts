import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { FastifyRequest } from "fastify";
import { isProviderKey, type JwtPayload, type Provider } from "@nodo/shared";
import { CurrentTenantOrNone } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { ProvidersService } from "../providers/providers.service";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { TenantsService } from "../tenants/tenants.service";
import { CreateListProviderDto, EnableOwnListDto, SaveImportProfileDto } from "./dto/list-import.dto";
import { ListImportService, type ImportActor } from "./list-import.service";

function assertProvider(value: string): Provider {
  if (!isProviderKey(value)) throw new BadRequestException(`Proveedor inválido: ${value}`);
  return value;
}

function actorOf(user: JwtPayload, tenant: TenantContext | null): ImportActor {
  return { userId: user.sub, isSuperadmin: user.role === "ROLE_ADMIN", tenant };
}

/**
 * Proveedores por lista: crearlos y cargarles planillas. Todos los tipos de
 * organización pueden subir; el nivel (base o propio) lo decide el servicio.
 */
@UseGuards(AuthGuard("jwt"), RolesGuard, TenantGuard)
@Controller()
export class ListImportController {
  constructor(
    private readonly imports: ListImportService,
    private readonly tenants: TenantsService,
    private readonly providers: ProvidersService
  ) {}

  /** Crea un distribuidor o marca por lista. Un comercio queda vinculado y con su configuración de compra. */
  @Post("providers")
  async createListProvider(
    @CurrentUser() user: JwtPayload,
    @CurrentTenantOrNone() tenant: TenantContext | null,
    @Body() dto: CreateListProviderDto
  ) {
    const isSuperadmin = user.role === "ROLE_ADMIN";
    if (!isSuperadmin && !tenant) throw new BadRequestException("Tu usuario no pertenece a ninguna organización");
    const createdByRetailer = !isSuperadmin && tenant?.tenantType === "RETAILER";
    if (!isSuperadmin && !createdByRetailer) {
      throw new BadRequestException("Un distribuidor o marca habilita su propia lista desde su organización");
    }
    const supplier = await this.tenants.createListProvider({
      name: dto.name,
      type: dto.type,
      listUpdateDays: dto.listUpdateDays,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      notes: dto.notes,
      managedByPlatform: createdByRetailer,
    });
    const providerKey = supplier.providerKey as string;
    if (createdByRetailer && tenant) {
      const client = commercialId(tenant);
      // Lo creó el comercio: no hay nadie del otro lado todavía. Queda conectado por lista.
      await this.tenants.upsertLink({ clientTenantId: client, supplierTenantId: supplier.id, status: "LIST_CONNECTED" });
      if (dto.config) await this.providers.updateConfig(client, providerKey, dto.config);
    }
    return { id: supplier.id, name: supplier.name, type: supplier.type, providerKey, listUpdateDays: supplier.listUpdateDays };
  }

  /** Un distribuidor o marca ya existente habilita su catálogo por lista. */
  @Post("providers/enable-own-list")
  async enableOwnList(@CurrentTenantOrNone() tenant: TenantContext | null, @Body() dto: EnableOwnListDto) {
    if (!tenant) throw new BadRequestException("Tu usuario no pertenece a ninguna organización");
    const updated = await this.tenants.enableOwnListProvider(tenant.tenantId, dto.listUpdateDays);
    return { id: updated.id, name: updated.name, type: updated.type, providerKey: updated.providerKey, listUpdateDays: updated.listUpdateDays };
  }

  @Post("providers/:provider/imports")
  async upload(
    @CurrentUser() user: JwtPayload,
    @CurrentTenantOrNone() tenant: TenantContext | null,
    @Param("provider") provider: string,
    @Req() req: FastifyRequest
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException("No se recibió ningún archivo");
    const buffer = await file.toBuffer();
    return this.imports.upload(actorOf(user, tenant), assertProvider(provider), { buffer, filename: file.filename });
  }

  @Get("providers/:provider/imports")
  list(@CurrentUser() user: JwtPayload, @CurrentTenantOrNone() tenant: TenantContext | null, @Param("provider") provider: string) {
    return this.imports.list(actorOf(user, tenant), assertProvider(provider));
  }

  @Get("providers/:provider/imports/:id")
  get(@CurrentUser() user: JwtPayload, @CurrentTenantOrNone() tenant: TenantContext | null, @Param("id") id: string) {
    return this.imports.get(id, actorOf(user, tenant));
  }

  @Post("providers/:provider/imports/:id/apply")
  apply(@CurrentUser() user: JwtPayload, @CurrentTenantOrNone() tenant: TenantContext | null, @Param("id") id: string) {
    return this.imports.applyImport(id, actorOf(user, tenant));
  }

  @Post("providers/:provider/imports/:id/discard")
  discard(@CurrentUser() user: JwtPayload, @CurrentTenantOrNone() tenant: TenantContext | null, @Param("id") id: string) {
    return this.imports.discard(id, actorOf(user, tenant));
  }

  @Post("providers/:provider/imports/:id/revert")
  revert(@CurrentUser() user: JwtPayload, @CurrentTenantOrNone() tenant: TenantContext | null, @Param("id") id: string) {
    return this.imports.revert(id, actorOf(user, tenant));
  }

  @Get("providers/:provider/import-profile")
  getProfile(@CurrentUser() user: JwtPayload, @CurrentTenantOrNone() tenant: TenantContext | null, @Param("provider") provider: string) {
    return this.imports.getProfile(actorOf(user, tenant), assertProvider(provider));
  }

  @Put("providers/:provider/import-profile")
  saveProfile(
    @CurrentUser() user: JwtPayload,
    @CurrentTenantOrNone() tenant: TenantContext | null,
    @Param("provider") provider: string,
    @Body() dto: SaveImportProfileDto
  ) {
    return this.imports.saveProfile(actorOf(user, tenant), assertProvider(provider), dto);
  }

  @Post("providers/:provider/import-profile/suggest")
  suggestProfile(
    @CurrentUser() user: JwtPayload,
    @CurrentTenantOrNone() tenant: TenantContext | null,
    @Param("provider") provider: string,
    @Query("sheet") sheet?: string
  ) {
    const sheetIndex = sheet !== undefined && sheet !== "" ? Number(sheet) : undefined;
    return this.imports.suggestProfile(actorOf(user, tenant), assertProvider(provider), Number.isFinite(sheetIndex) ? sheetIndex : undefined);
  }

  @Get("providers/:provider/freshness")
  freshness(@CurrentUser() user: JwtPayload, @CurrentTenantOrNone() tenant: TenantContext | null, @Param("provider") provider: string) {
    return this.imports.freshness(actorOf(user, tenant), assertProvider(provider));
  }
}
