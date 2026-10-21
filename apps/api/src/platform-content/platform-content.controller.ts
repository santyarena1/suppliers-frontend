import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import type { JwtPayload } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PlatformContentService } from "./platform-content.service";

/** Importación de contenido enriquecido (AcuStock). Solo superadmin. */
@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/platform-content")
export class PlatformContentController {
  constructor(private readonly content: PlatformContentService) {}

  @Get("status")
  status() {
    return this.content.status();
  }

  /** Cruza sin escribir contenido: devuelve el resumen en la corrida. */
  @Post("acustock/preview")
  preview(@CurrentUser() me: JwtPayload) {
    return this.content.start("PREVIEW", me.userId);
  }

  /** Carga el contenido y reemplaza los vínculos. */
  @Post("acustock/apply")
  apply(@CurrentUser() me: JwtPayload) {
    return this.content.start("APPLY", me.userId);
  }
}
