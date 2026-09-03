import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { NewsTrackDto, UpsertNewsDto } from "./dto/news.dto";
import { NewsService } from "./news.service";

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("news")
export class NewsFeedController {
  constructor(private readonly news: NewsService) {}

  @Get("hero")
  hero(@CurrentTenant() tenant: TenantContext) {
    return this.news.hero(tenant);
  }

  @Get()
  feed(
    @CurrentTenant() tenant: TenantContext,
    @Query("kind") kind?: string,
    @Query("authorType") authorType?: string,
    @Query("q") q?: string,
    @Query("cursor") cursor?: string,
    @Query("take") take?: string
  ) {
    return this.news.feed(tenant, { kind, authorType, q, cursor, take: take ? Number(take) : undefined });
  }

  @Get(":id")
  getOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.news.getOne(tenant, id);
  }

  @Post(":id/track")
  track(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: NewsTrackDto) {
    return this.news.track(tenant, id, dto.kind);
  }
}

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/news")
export class MyNewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  mine(@CurrentTenant() tenant: TenantContext) {
    return this.news.listMine(tenant);
  }

  @Get(":id")
  getMine(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.news.getMine(tenant, id);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertNewsDto) {
    return this.news.create(tenant, dto);
  }

  @Put(":id")
  update(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: UpsertNewsDto) {
    return this.news.update(tenant, id, dto);
  }

  @Delete(":id")
  remove(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.news.remove(tenant, id);
  }
}

@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/news")
export class AdminNewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  list() {
    return this.news.adminList();
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.news.adminRemove(id);
  }
}

@Controller("public/news")
export class PublicNewsController {
  constructor(private readonly news: NewsService) {}

  @Public()
  @Get(":publicKey")
  get(@Param("publicKey") publicKey: string) {
    return this.news.getPublic(publicKey);
  }
}
