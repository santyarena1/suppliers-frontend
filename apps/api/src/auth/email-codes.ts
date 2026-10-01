import { createHash, randomInt, timingSafeEqual } from "crypto";

export const VERIFY_EMAIL = "VERIFY_EMAIL";
export const CODE_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_ATTEMPTS = 5;

export function generateEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashEmailCode(code: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${code}`).digest("hex");
}

export function emailCodesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
