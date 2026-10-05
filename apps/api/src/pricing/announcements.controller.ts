import { BadRequestException, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ANNOUNCEMENTS, isAnnouncementKey, type JwtPayload } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Avisos de novedades (pop-up una sola vez por persona). La lista blanca vive en
 * @nodo/shared (`ANNOUNCEMENTS`); lo visto queda en `User.seenAnnouncements`.
 */
@UseGuards(AuthGuard("jwt"))
@Controller("me/announcements")
export class AnnouncementsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    const row = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { seenAnnouncements: true } });
    const seen = row?.seenAnnouncements ?? [];
    return { seen, pending: ANNOUNCEMENTS.filter((key) => !seen.includes(key)) };
  }

  /** Idempotente: marcarlo dos veces no lo repite. */
  @Post(":key/seen")
  async seen(@CurrentUser() user: JwtPayload, @Param("key") key: string) {
    if (!isAnnouncementKey(key)) throw new BadRequestException("Aviso desconocido");
    const row = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { seenAnnouncements: true } });
    const seen = row?.seenAnnouncements ?? [];
    if (!seen.includes(key)) {
      await this.prisma.user.update({ where: { id: user.userId }, data: { seenAnnouncements: { push: key } } });
    }
    return { seen: seen.includes(key) ? seen : [...seen, key] };
  }
}
