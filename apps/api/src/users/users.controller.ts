import { Body, Controller, Delete, Get, Put, UseGuards } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UsersService } from "./users.service";
import { UpdateActiveStatusDto } from "./dto/update-active-status.dto";
import { UpdateEndDateDto } from "./dto/update-end-date.dto";
import { DeleteUserDto } from "./dto/delete-user.dto";

@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("admin/users")
  list() {
    return this.usersService.list();
  }

  @Put("user/update-active-status")
  updateActiveStatus(@Body() dto: UpdateActiveStatusDto) {
    return this.usersService.updateActiveStatus(dto);
  }

  @Put("user/update-end-date")
  updateEndDate(@Body() dto: UpdateEndDateDto) {
    return this.usersService.updateEndDate(dto);
  }

  @Delete("user/delete")
  delete(@Body() dto: DeleteUserDto) {
    return this.usersService.delete(dto);
  }
}
