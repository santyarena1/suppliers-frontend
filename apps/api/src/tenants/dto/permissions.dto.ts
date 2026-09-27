import { IsObject } from "class-validator";
import type { PermissionChanges } from "../tenant-permissions.service";

/** `{ "orders.approve": true, "chat.write": null }` — null vuelve al valor heredado. */
export class PermissionChangesDto {
  @IsObject()
  changes!: PermissionChanges;
}
