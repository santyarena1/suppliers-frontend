import type { TenantRole, TenantType } from "./tenants";

export type UserRole = "ROLE_USER" | "ROLE_ADMIN" | "ROLE_BRAND";

export interface JwtPayload {
  sub: string;
  userId: string;
  role: UserRole;
  email: string;
  brandId?: string;
  /**
   * Organización a la que pertenece quien usa la sesión, y su rol adentro. Ausente
   * si no hay membresía. El superadmin de prueba pertenece a Administración:
   * carrito propio, y `commercialTenantId` apunta al Comercio de Pruebas para
   * credenciales y vínculos.
   *
   * `role` es el nivel de plataforma; el alcance real de negocio lo da esto. Las
   * sesiones emitidas antes de que existieran estos campos no los traen, así que
   * el backend siempre debe poder resolverlos contra la base.
   */
  tenantId?: string;
  tenantName?: string;
  tenantType?: TenantType;
  tenantRole?: TenantRole;
  /** Organización de la que se leen credenciales, vínculos y catálogo. */
  commercialTenantId?: string;
  /**
   * Presente solo cuando un administrador está usando la plataforma como este
   * usuario. Guarda el id y el nombre de quien inició la suplantación, para que
   * toda acción hecha en esa sesión sea atribuible a una persona real.
   */
  impersonatedBy?: string;
  impersonatedByUsername?: string;
}
