import { ValidationError } from "@/lib/errors";

export type FileKind = "image" | "document";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"] as const;

export const ACCEPT: Record<FileKind, string> = {
  image: IMAGE_TYPES.join(","),
  document: DOCUMENT_TYPES.join(","),
};

export function maxUploadBytes() {
  const mb = Number(process.env.STORAGE_MAX_FILE_MB ?? 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
}

/**
 * Detect the real type from magic bytes — the client-declared MIME type and
 * extension are not trusted.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "image/webp";
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d)
    return "application/pdf";
  return null;
}

export function validateUpload(bytes: Uint8Array, kind: FileKind): string {
  if (bytes.length === 0) throw new ValidationError("The file is empty.");
  const max = maxUploadBytes();
  if (bytes.length > max) {
    throw new ValidationError(`File is too large. Maximum size is ${Math.round(max / 1024 / 1024)} MB.`);
  }
  const mime = sniffMimeType(bytes);
  const allowed: readonly string[] = kind === "image" ? IMAGE_TYPES : DOCUMENT_TYPES;
  if (!mime || !allowed.includes(mime)) {
    throw new ValidationError(
      kind === "image" ? "Upload a JPG, PNG or WebP image." : "Upload a PDF, JPG, PNG or WebP file.",
    );
  }
  return mime;
}

export function safeFileName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().slice(0, 120);
  return cleaned || "file";
}

export const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
