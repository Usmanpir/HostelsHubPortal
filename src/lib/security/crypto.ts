import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for secrets stored in the database (payment gateway
 * credentials). AES-256-GCM with a random 96-bit IV per value; the auth tag
 * makes tampering detectable.
 *
 * Stored format: `v1.<iv b64url>.<tag b64url>.<ciphertext b64url>`
 *
 * Key: PAYMENTS_ENCRYPTION_KEY (32 random bytes, base64). When unset, a key is
 * derived from AUTH_SECRET with HKDF so development works out of the box — in
 * production a dedicated key is strongly recommended (rotating AUTH_SECRET
 * would otherwise make stored secrets unreadable).
 */

const VERSION = "v1";
const IV_BYTES = 12;
const HKDF_INFO = "hostel-saas/payment-secrets/v1";

let cachedKey: { source: string; key: Buffer } | null = null;
let warned = false;

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

function resolveKey(): Buffer {
  const explicit = process.env.PAYMENTS_ENCRYPTION_KEY?.trim();
  const authSecret = process.env.AUTH_SECRET ?? "";
  const source = explicit ? `k:${explicit}` : `a:${authSecret}`;
  if (cachedKey?.source === source) return cachedKey.key;

  let key: Buffer;
  if (explicit) {
    key = Buffer.from(explicit, "base64");
    if (key.length !== 32) {
      throw new EncryptionKeyError("PAYMENTS_ENCRYPTION_KEY must be 32 bytes encoded as base64 (generate with: openssl rand -base64 32).");
    }
  } else {
    if (!authSecret) throw new EncryptionKeyError("Set PAYMENTS_ENCRYPTION_KEY (or AUTH_SECRET) to store payment gateway secrets.");
    if (process.env.NODE_ENV === "production" && !warned) {
      warned = true;
      console.warn(
        "[crypto] PAYMENTS_ENCRYPTION_KEY is not set; deriving the payment secrets key from AUTH_SECRET. Set a dedicated key in production.",
      );
    }
    key = Buffer.from(hkdfSync("sha256", authSecret, Buffer.alloc(0), HKDF_INFO, 32));
  }
  cachedKey = { source, key };
  return key;
}

export function encryptString(plaintext: string, key: Buffer = resolveKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptString(payload: string, key: Buffer = resolveKey()): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== VERSION || !ivPart || !tagPart || dataPart === undefined) {
    throw new EncryptionKeyError("Unsupported encrypted payload.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new EncryptionKeyError("Stored secrets could not be decrypted. Was the encryption key changed?");
  }
}

export function encryptJson(value: Record<string, string>, key?: Buffer): string {
  return encryptString(JSON.stringify(value), key);
}

export function decryptJson(payload: string, key?: Buffer): Record<string, string> {
  const parsed: unknown = JSON.parse(decryptString(payload, key));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
