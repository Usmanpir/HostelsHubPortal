import { createHash, randomBytes } from "node:crypto";

/** Random URL-safe token; only its SHA-256 hash is stored in the database. */
export function generateToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
