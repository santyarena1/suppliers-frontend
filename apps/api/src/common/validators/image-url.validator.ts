import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from "class-validator";

/** URL http(s) externa o path local servido por la API (`/uploads/...`). */
export function isImageUrlOrUploadPath(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  if (value.startsWith("/uploads/")) {
    return /^\/uploads\/[a-zA-Z0-9._-]+$/.test(value);
  }
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
          return `${args.property} debe ser una URL válida o un path /uploads/...`;
        },
      },
    });
  };
}
