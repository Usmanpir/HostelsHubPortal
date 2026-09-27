"use client";

import { useRef, useState } from "react";
import { FileUp, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type UploadedFile = { id: string; name: string; size: number; mimeType: string };

export type UploadPurpose =
  | "resident-document"
  | "resident-photo"
  | "staff-document"
  | "staff-photo"
  | "expense-receipt"
  | "maintenance-photo"
  | "organization-logo"
  | "assignment-document";

const ACCEPT = {
  image: "image/jpeg,image/png,image/webp",
  document: "application/pdf,image/jpeg,image/png,image/webp",
};

/** Upload a file to private storage; returns the stored file id to submit with a form. */
export async function uploadFile(file: File, purpose: UploadPurpose): Promise<UploadedFile> {
  const body = new FormData();
  body.set("file", file);
  body.set("purpose", purpose);
  const res = await fetch("/api/files", { method: "POST", body });
  const json = (await res.json().catch(() => null)) as { data?: UploadedFile; error?: { message: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Upload failed");
  return json.data;
}

export function FileUpload({
  purpose,
  kind = "document",
  value,
  onChange,
  label = "Upload file",
  hint = "PDF, JPG, PNG or WebP · up to 10 MB",
  className,
  disabled,
}: {
  purpose: UploadPurpose;
  kind?: "image" | "document";
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  label?: string;
  hint?: string;
  className?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadFile(file, purpose));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  if (value) {
    return (
      <div className={cn("flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm", className)}>
        <Paperclip className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{value.name}</span>
        <span className="text-xs text-muted-foreground">{Math.ceil(value.size / 1024)} KB</span>
        <Button type="button" size="icon-xs" variant="ghost" onClick={() => onChange(null)} aria-label="Remove file">
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        className="sr-only"
        accept={ACCEPT[kind]}
        onChange={(e) => pick(e.target.files?.[0])}
        disabled={disabled || busy}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pick(e.dataTransfer.files?.[0]);
        }}
        className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 disabled:opacity-60"
      >
        {busy ? <Spinner /> : <FileUp className="size-5" />}
        <span className="font-medium text-foreground">{busy ? "Uploading…" : label}</span>
        <span className="text-xs">{hint}</span>
      </button>
    </div>
  );
}
