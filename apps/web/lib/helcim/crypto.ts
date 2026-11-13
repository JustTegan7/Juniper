import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for Helcim tokens stored in the database. Format: v1.<iv>.<tag>.<ciphertext>, all base64url.
// The key is HELCIM_ENCRYPTION_KEY: 32 random bytes, base64. Losing the key means reconnecting each business.

function keyFrom(raw: string | undefined): Buffer {
  if (!raw) throw new Error("HELCIM_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("HELCIM_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return key;
}

export function encryptSecret(plain: string, rawKey: string | undefined = process.env.HELCIM_ENCRYPTION_KEY): string {
  const key = keyFrom(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(stored: string, rawKey: string | undefined = process.env.HELCIM_ENCRYPTION_KEY): string {
  const key = keyFrom(rawKey);
  const [version, iv, tag, enc] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !enc) throw new Error("Unrecognized encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]).toString("utf8");
}
