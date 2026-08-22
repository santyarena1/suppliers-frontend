import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ALL_PROVIDERS, type JwtPayload, type Provider } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UsersService } from "../users/users.service";
import { DeleteUserDto } from "../users/dto/delete-user.dto";
import { AdminService } from "./admin.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { UpdatePermissionsDto } from "./dto/update-permissions.dto";
import { UpdateProviderDisplayDto } from "./dto/update-provider-display.dto";
import { UpdateBrandDisplayDto } from "./dto/update-brand-display.dto";
import { CreateBannerDto, UpdateBannerDto } from "./dto/banner.dto";
import { UpdatePlatformSettingsDto } from "./dto/platform-settings.dto";
import { ActiveStatusBodyDto, EndDateBodyDto } from "./dto/body-only.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

function assertProvider(value: string): Provider {
  if (!ALL_PROVIDERS.includes(value as Provider)) {
    throw new BadRequestException(`Proveedor inválido: ${value}`);
  }
  return value as Provider;
}

/** Todo lo que administra el superusuario. Requiere ROLE_ADMIN. */
@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService
  ) {}

  // Listar usuarios ya lo expone UsersController en GET /admin/users (se
  // mantiene ahí para no romper el contrato existente). Acá solo lo que faltaba.
  @Post("users")
  createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Put("users/:id/role")
  updateRole(@Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.adminService.updateRole(id, dto);
  }

  @Put("users/:id")
  updateUser(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Put("users/:id/password")
  resetPassword(@Param("id") id: string, @Body() dto: ResetPasswordDto) {
    return this.adminService.resetPassword(id, dto.password);
  }

  @Put("users/:id/active-status")
  updateActiveStatus(@Param("id") id: string, @Body() dto: ActiveStatusBodyDto) {
    return this.usersService.updateActiveStatus({ userId: id, active: dto.active });
  }

  @Put("users/:id/end-date")
  updateEndDate(@Param("id") id: string, @Body() dto: EndDateBodyDto) {
    return this.usersService.updateEndDate({ userId: id, endDate: dto.endDate });
  }

  @Delete("users/:id")
  deleteUser(@Param("id") id: string, @CurrentUser() me: JwtPayload) {
    if (id === me.userId) {
      throw new BadRequestException("No podés eliminarte a vos mismo");
    }
    return this.usersService.delete({ userId: id } as DeleteUserDto);
  }

  // Permisos por módulo
  @Get("permissions/:userId")
  getPermissions(@Param("userId") userId: string) {
    return this.adminService.getPermissions(userId);
  }

  @Put("permissions/:userId")
  updatePermissions(@Param("userId") userId: string, @Body() dto: UpdatePermissionsDto) {
    return this.adminService.updatePermissions(userId, dto);
  }

  // Visibilidad / display de proveedores
  @Get("providers/display")
  listProviderDisplay() {
    return this.adminService.listProviderDisplay();
  }

  @Put("providers/:provider/display")
  updateProviderDisplay(@Param("provider") provider: string, @Body() dto: UpdateProviderDisplayDto) {
    return this.adminService.updateProviderDisplay(assertProvider(provider), dto);
  }

  // Visibilidad / display de marcas
  @Get("brands/display")
  listBrandDisplay() {
    return this.adminService.listBrandDisplay();
  }

  @Put("brands/:brandId/display")
  updateBrandDisplay(@Param("brandId") brandId: string, @Body() dto: UpdateBrandDisplayDto) {
    return this.adminService.updateBrandDisplay(brandId, dto);
  }

  // Banners
  @Get("banners")
  listAllBanners() {
    return this.adminService.listAllBanners();
  }

  @Post("banners")
  createBanner(@Body() dto: CreateBannerDto) {
    return this.adminService.createBanner(dto);
  }

  @Put("banners/:id")
  updateBanner(@Param("id") id: string, @Body() dto: UpdateBannerDto) {
    return this.adminService.updateBanner(id, dto);
  }

  @Delete("banners/:id")
  deleteBanner(@Param("id") id: string) {
    return this.adminService.deleteBanner(id);
  }

  @Get("platform/settings")
  getPlatformSettings() {
    return this.adminService.getPlatformSettings();
  }

  @Put("platform/settings")
  updatePlatformSettings(@Body() dto: UpdatePlatformSettingsDto) {
    return this.adminService.updatePlatformSettings(dto.brandPreset);
  }
}

/** Endpoints de plataforma que consume cualquier usuario autenticado (no solo admin). */
@Controller()
export class PlatformController {
  constructor(private readonly adminService: AdminService) {}

  @Get("me/permissions")
  myPermissions(@CurrentUser() user: JwtPayload) {
    return this.adminService.getEffectivePermissions(user.userId, user.role);
  }

  @Get("catalog/provider-display")
  providerDisplay() {
    return this.adminService.listProviderDisplay();
  }

  @Get("banners")
  banners(@Query("position") position?: string) {
    return this.adminService.listBanners(position);
  }

  @Get("platform/settings")
  platformSettings() {
    return this.adminService.getPlatformSettings();
  }
}
