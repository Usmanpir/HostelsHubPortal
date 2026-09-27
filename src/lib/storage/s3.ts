import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./types";

export type S3Config = {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/** Any S3-compatible service: AWS S3, Cloudflare R2, MinIO, B2, Spaces… */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: !!config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: this.client.config.endpoint ? undefined : "AES256",
      }),
    );
  }

  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      return { body: await res.Body.transformToByteArray(), contentType: res.ContentType };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedUrl(key: string, options: { expiresInSeconds: number; downloadName?: string }) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: options.downloadName
        ? `inline; filename="${options.downloadName.replace(/"/g, "")}"`
        : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: options.expiresInSeconds });
  }
}
