import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { type JwtPayload, type Provider, isProviderKey } from "@nodo/shared";
import { AuthService } from "../auth/auth.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UsersService } from "../users/users.service";
import { AdminService } from "./admin.service";
import { ProviderMergeService } from "./provider-merge.service";
import { MergeProvidersDto } from "./dto/merge-providers.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { SuperadminDto } from "./dto/superadmin.dto";
import { UpdateProviderDisplayDto } from "./dto/update-provider-display.dto";
import { UpdateBrandDisplayDto } from "./dto/update-brand-display.dto";
import { CreateBannerDto, UpdateBannerDto } from "./dto/banner.dto";
import { UpdatePlatformSettingsDto } from "./dto/platform-settings.dto";
import { ActiveStatusBodyDto, EndDateBodyDto } from "./dto/body-only.dto";
import { AccountSetupRequiredDto, ResetPasswordDto } from "./dto/reset-password.dto";
import { SendUserEmailDto } from "./dto/send-user-email.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

function assertProvider(value: string): Provider {
  if (!isProviderKey(value)) {
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
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly providerMerge: ProviderMergeService
  ) {}

  // ---------- Usuarios ----------
  // Única puerta para administrar cuentas. Los miembros de una organización se
  // crean y asignan desde /admin/tenants/*; acá se edita la cuenta en sí.

  @Get("users")
  listUsers() {
    return this.usersService.list();
  }

  /** Solo da de alta superadmins (el único usuario sin organización). */
  @Post("users")
  createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Put("users/:id/superadmin")
  setSuperadmin(@Param("id") id: string, @Body() dto: SuperadminDto, @CurrentUser() me: JwtPayload) {
    if (id === me.userId) {
      throw new BadRequestException("No podés cambiar tu propio superadmin");
    }
    return this.adminService.setSuperadmin(id, dto.superadmin);
  }

  @Put("users/:id")
  updateUser(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Put("users/:id/password")
  resetPassword(@Param("id") id: string, @Body() dto: ResetPasswordDto) {
    return this.adminService.resetPassword(id, dto.password, dto.requireSetup ?? true);
  }

  @Put("users/:id/account-setup")
  setAccountSetupRequired(@Param("id") id: string, @Body() dto: AccountSetupRequiredDto) {
    return this.adminService.setAccountSetupRequired(id, dto.required);
  }

  /** Escribe al mail de la cuenta. No hay baja: el email es el canal de NODO. */
  @Post("users/:id/email")
  sendUserEmail(@Param("id") id: string, @Body() dto: SendUserEmailDto) {
    return this.adminService.sendUserEmail(id, dto);
  }

  /** Devuelve una sesión del usuario indicado para ver la plataforma como él. */
  @Post("users/:id/impersonate")
  impersonate(@Param("id") id: string, @CurrentUser() me: JwtPayload) {
    return this.authService.impersonate(id, me);
  }

  @Put("users/:id/active-status")
  updateActiveStatus(@Param("id") id: string, @Body() dto: ActiveStatusBodyDto) {
    return this.usersService.updateActiveStatus(id, dto.active);
  }

  @Put("users/:id/end-date")
  updateEndDate(@Param("id") id: string, @Body() dto: EndDateBodyDto) {
    return this.usersService.updateEndDate(id, dto.endDate ?? null);
  }

  @Delete("users/:id")
  deleteUser(@Param("id") id: string, @CurrentUser() me: JwtPayload) {
    if (id === me.userId) {
      throw new BadRequestException("No podés eliminarte a vos mismo");
    }
    return this.usersService.delete(id);
  }

  // Unificar un proveedor por lista duplicado dentro del real
  @Get("providers/merge-candidates")
  mergeCandidates() {
    return this.providerMerge.candidates();
  }

  @Post("providers/merge")
  mergeProviders(@Body() dto: MergeProvidersDto) {
    return this.providerMerge.merge(assertProvider(dto.from), assertProvider(dto.into));
  }

  // Visibilidad / display de proveedores
  @Get("providers/display")
  listProviderDisplay() {
    return this.adminService.listProviderDisplay(true);
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
