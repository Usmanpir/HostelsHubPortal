export type StoredObject = {
  body: Uint8Array;
  contentType?: string;
};

/**
 * Storage provider abstraction. Objects are always private: callers must go
 * through /api/files/[id], which authorizes the request before streaming.
 */
export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Short-lived signed URL, if the provider supports it (null = stream through the app). */
  signedUrl?(key: string, options: { expiresInSeconds: number; downloadName?: string }): Promise<string | null>;
}
