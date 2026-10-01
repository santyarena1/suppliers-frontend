import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPublicKey, createVerify, type KeyObject } from "crypto";

export type GoogleProfile = {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
};

const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const CERTS_TTL_MS = 60 * 60 * 1000;

type Jwk = { kid?: string; kty?: string; n?: string; e?: string };

/**
 * Valida el ID token de Google Identity Services con las claves públicas de
 * Google (JWKS). Sin librería extra: el JWT se verifica con crypto de Node.
 */
@Injectable()
export class GoogleTokenVerifier {
  private cached: { keys: Map<string, KeyObject>; until: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    return Boolean(this.config.get<string>("GOOGLE_CLIENT_ID")?.trim());
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID")?.trim();
    if (!clientId) {
      throw new ServiceUnavailableException("Login con Google no está configurado");
    }

    const parts = idToken.split(".");
    if (parts.length !== 3) throw new UnauthorizedException("No se pudo validar Google");
    const [headerB64, payloadB64, sigB64] = parts;

    let header: { kid?: string; alg?: string };
    let payload: {
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      aud?: string | string[];
      iss?: string;
      exp?: number;
    };
    try {
      header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as typeof header;
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as typeof payload;
    } catch {
      throw new UnauthorizedException("No se pudo validar Google");
    }
    if (header.alg !== "RS256" || !header.kid) {
      throw new UnauthorizedException("No se pudo validar Google");
    }

    const key = await this.keyFor(header.kid);
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    const ok = verifier.verify(key, Buffer.from(sigB64, "base64url"));
    if (!ok) throw new UnauthorizedException("No se pudo validar Google");

    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audience.includes(clientId)) throw new UnauthorizedException("No se pudo validar Google");
    if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
      throw new UnauthorizedException("No se pudo validar Google");
    }
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      throw new UnauthorizedException("No se pudo validar Google");
    }
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException("No se pudo validar Google");
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true || payload.email_verified === "true",
      ...(payload.name ? { name: payload.name } : {}),
    };
  }

  private async keyFor(kid: string): Promise<KeyObject> {
    const keys = await this.certs();
    const hit = keys.get(kid);
    if (!hit) throw new UnauthorizedException("No se pudo validar Google");
    return hit;
  }

  private async certs(): Promise<Map<string, KeyObject>> {
    if (this.cached && this.cached.until > Date.now()) return this.cached.keys;
    const res = await fetch(GOOGLE_CERTS);
    if (!res.ok) throw new UnauthorizedException("No se pudo validar Google");
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || jwk.kty !== "RSA") continue;
      keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
    }
    this.cached = { keys, until: Date.now() + CERTS_TTL_MS };
    return keys;
  }
}
