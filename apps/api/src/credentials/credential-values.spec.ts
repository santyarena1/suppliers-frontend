import { BadRequestException } from "@nestjs/common";
import { cleanCredentialValues } from "./credential-values";

describe("cleanCredentialValues", () => {
  it("acepta pares campo → texto y recorta los nombres", () => {
    expect(cleanCredentialValues({ " user ": "ana", password: "x" })).toEqual({ user: "ana", password: "x" });
  });

  it.each([
    ["vacío", {}],
    ["todo en blanco", { user: " ", password: "" }],
    ["no es objeto", "user=ana"],
    ["lista", ["ana"]],
    ["número", { userId: 123 }],
    ["objeto anidado", { token: { nested: true } }],
    ["valor gigante", { token: "x".repeat(1001) }],
    ["demasiados campos", Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${i}`, "v"]))],
  ])("rechaza %s", (_label, value) => {
    expect(() => cleanCredentialValues(value)).toThrow(BadRequestException);
  });
});
