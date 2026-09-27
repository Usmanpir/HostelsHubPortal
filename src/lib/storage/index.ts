import "server-only";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let provider: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (provider) return provider;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "s3") {
    const { STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_BUCKET } = process.env;
    if (!STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY || !STORAGE_BUCKET) {
      throw new Error("STORAGE_DRIVER=s3 requires STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY and STORAGE_BUCKET");
    }
    provider = new S3StorageProvider({
      endpoint: STORAGE_ENDPOINT,
      region: STORAGE_REGION || "auto",
      accessKeyId: STORAGE_ACCESS_KEY,
      secretAccessKey: STORAGE_SECRET_KEY,
      bucket: STORAGE_BUCKET,
    });
  } else {
    provider = new LocalStorageProvider();
  }
  return provider;
}

/** Allow tests to inject an in-memory provider. */
export function setStorageForTesting(p: StorageProvider | undefined) {
  provider = p;
}

export type { StorageProvider } from "./types";
