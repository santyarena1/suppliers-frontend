import { IsIn } from "class-validator";

export const BRAND_PRESETS = ["violet", "gamer_red", "ocean", "emerald"] as const;
export type BrandPreset = (typeof BRAND_PRESETS)[number];

export class UpdatePlatformSettingsDto {
  @IsIn(BRAND_PRESETS)
  brandPreset!: BrandPreset;
}
