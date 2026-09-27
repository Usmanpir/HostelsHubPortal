"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { uploadFile, type UploadedFile } from "@/components/shared/file-upload";
import { cn } from "@/lib/utils";

/**
 * Multi-photo uploader for maintenance requests. Each file is uploaded to
 * private storage immediately; the returned ids are submitted with the form
 * and attached to the request by the server.
 */
export function PhotoUploader({
  value,
  onChange,
  max = 10,
  disabled,
  className,
}: {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  max?: number;
  disabled?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const remaining = max - value.length;

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, Math.max(0, remaining));
    if (list.length > files.length) toast.error(`You can attach up to ${max} photos.`);
    setBusy(files.length);
    const uploaded: UploadedFile[] = [];
    for (const file of files) {
      try {
        uploaded.push(await uploadFile(file, "maintenance-photo"));
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "Upload failed"}`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (uploaded.length) onChange([...value, ...uploaded]);
    if (input.current) input.current.value = "";
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => void pick(e.target.files)}
        disabled={disabled || busy > 0 || remaining <= 0}
      />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {value.map((f) => (
          <div key={f.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route */}
            <img src={`/api/files/${f.id}`} alt={f.name} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v.id !== f.id))}
              className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
              aria-label={`Remove ${f.name}`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {remaining > 0 ? (
          <button
            type="button"
            disabled={disabled || busy > 0}
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files);
            }}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 disabled:opacity-60"
          >
            {busy > 0 ? <Spinner /> : value.length ? <ImagePlus className="size-5" /> : <Camera className="size-5" />}
            <span className="font-medium text-foreground">{busy > 0 ? "Uploading…" : value.length ? "Add more" : "Add photos"}</span>
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG or WebP · up to {max} photos · 10 MB each</p>
    </div>
  );
}
