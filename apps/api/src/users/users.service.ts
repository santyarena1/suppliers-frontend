import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateActiveStatusDto } from "./dto/update-active-status.dto";
import { UpdateEndDateDto } from "./dto/update-end-date.dto";
import { DeleteUserDto } from "./dto/delete-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true, email: true, role: true, active: true, endDate: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return users;
  }

  private async assertExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    return user;
  }

  async updateActiveStatus(dto: UpdateActiveStatusDto) {
    await this.assertExists(dto.userId);
    const user = await this.prisma.user.update({
      where: { id: dto.userId },
      data: { active: dto.active },
    });
    return { id: user.id, active: user.active };
  }

  async updateEndDate(dto: UpdateEndDateDto) {
    await this.assertExists(dto.userId);
    const user = await this.prisma.user.update({
      where: { id: dto.userId },
      data: { endDate: new Date(dto.endDate) },
    });
    return { id: user.id, endDate: user.endDate };
  }

  async delete(dto: DeleteUserDto) {
    await this.assertExists(dto.userId);
    await this.prisma.user.delete({ where: { id: dto.userId } });
    return { id: dto.userId };
  }
}
