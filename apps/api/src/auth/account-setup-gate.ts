import { ForbiddenException } from "@nestjs/common";

/**
 * Lo único que puede usar alguien a quien le regeneraron la contraseña hasta
 * completar su cuenta: los pasos de completar y renovar el token (el resto de
 * lo que necesita la pantalla ya viaja en el JWT).
 */
const SETUP_PATHS = ["/auth/account-setup", "/auth/refresh"];

export function accountSetupAllows(path: string): boolean {
  const clean = path.split("?")[0].replace(/\/+$/, "");
  return SETUP_PATHS.some((p) => clean === p || clean.startsWith(`${p}/`));
}

export function accountSetupRequired(): ForbiddenException {
  return new ForbiddenException({
    message: "Antes de seguir, completá tu cuenta: confirmá tu mail y elegí una contraseña nueva o conectá Google.",
    code: "ACCOUNT_SETUP_REQUIRED",
  });
}
