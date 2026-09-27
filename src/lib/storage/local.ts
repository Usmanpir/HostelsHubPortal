import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider } from "./types";

/**
 * Development storage on the local filesystem, outside /public so files are
 * never directly reachable. Not suitable for serverless production.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(root = path.join(process.cwd(), ".storage")) {
    this.root = root;
  }

  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return target;
  }

  async put(key: string, body: Uint8Array) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async get(key: string) {
    try {
      const body = await readFile(this.resolve(key));
      return { body: new Uint8Array(body) };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}
