import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | undefined;

/**
 * Compare against a throwaway hash so a login for an unknown email takes the
 * same time as one for a real account (prevents account enumeration).
 */
export async function burnPasswordCheck(plain: string) {
  dummyHash ??= bcrypt.hash("timing-safe-placeholder", COST);
  await bcrypt.compare(plain, await dummyHash);
}
