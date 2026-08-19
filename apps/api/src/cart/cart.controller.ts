import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CartService } from "./cart.service";
import { AddCartItemDto } from "./dto/add-item.dto";
import { UpdateCartItemDto } from "./dto/update-item.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.cartService.list(user.userId);
  }

  @Post("items")
  addItem(@CurrentUser() user: { userId: string }, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.userId, dto);
  }

  @Patch("items/:id")
  updateItem(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @Body() dto: UpdateCartItemDto
  ) {
    return this.cartService.updateItem(user.userId, id, dto);
  }

  @Delete("items/:id")
  removeItem(@CurrentUser() user: { userId: string }, @Param("id") id: string) {
    return this.cartService.removeItem(user.userId, id);
  }

  @Delete()
  clear(@CurrentUser() user: { userId: string }) {
    return this.cartService.clear(user.userId);
  }
}
