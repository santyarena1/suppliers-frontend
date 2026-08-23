export type UserRole = "ROLE_USER" | "ROLE_ADMIN" | "ROLE_BRAND";

export interface JwtPayload {
  sub: string;
  userId: string;
  role: UserRole;
  email: string;
  brandId?: string;
  /**
   * Presente solo cuando un administrador está usando la plataforma como este
   * usuario. Guarda el id y el nombre de quien inició la suplantación, para que
   * toda acción hecha en esa sesión sea atribuible a una persona real.
   */
  impersonatedBy?: string;
  impersonatedByUsername?: string;
}
