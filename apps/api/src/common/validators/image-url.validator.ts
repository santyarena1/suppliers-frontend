import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from "class-validator";

const UPLOADS_PATH = /^\/uploads\/[a-zA-Z0-9._-]+$/;
const ASSETS_PATH =
  /^\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** URL http(s) externa o path local servido por la API (`/assets/...` o legacy `/uploads/...`). */
export function isImageUrlOrUploadPath(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  if (value.startsWith("/assets/")) return ASSETS_PATH.test(value);
  if (value.startsWith("/uploads/")) return UPLOADS_PATH.test(value);
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function IsImageUrlOrUploadPath(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isImageUrlOrUploadPath",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isImageUrlOrUploadPath(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe ser una URL válida o un path /assets/...`;
        },
      },
    });
  };
}
