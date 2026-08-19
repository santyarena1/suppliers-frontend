import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

@Injectable()
export class CryptoService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const hex = this.config.get<string>("ENCRYPTION_KEY");
    if (!hex || hex.length !== 64) {
      throw new Error("ENCRYPTION_KEY debe ser una clave hex de 32 bytes (64 caracteres).");
    }
    this.key = Buffer.from(hex, "hex");
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  decrypt(ciphertext: string): string {
    const raw = Buffer.from(ciphertext, "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = raw.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}
