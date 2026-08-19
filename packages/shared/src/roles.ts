export type UserRole = "ROLE_USER" | "ROLE_ADMIN" | "ROLE_BRAND";

export interface JwtPayload {
  sub: string;
  userId: string;
  role: UserRole;
  email: string;
  brandId?: string;
}
