import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { GoogleTokenVerifier } from "./google-token.verifier";

describe("GoogleTokenVerifier", () => {
  it("sin client id no está habilitado y verify falla", async () => {
    const verifier = new GoogleTokenVerifier({ get: jest.fn().mockReturnValue("") } as never);
    expect(verifier.enabled()).toBe(false);
    await expect(verifier.verify("x".repeat(40))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("rechaza un token que no es JWT", async () => {
    const verifier = new GoogleTokenVerifier({
      get: jest.fn().mockReturnValue("google-client-id.apps.googleusercontent.com"),
    } as never);
    expect(verifier.enabled()).toBe(true);
    await expect(verifier.verify("esto-no-es-un-jwt")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
