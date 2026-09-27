"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, ImageOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmAction } from "@/components/shared/confirm-action";
import type { UploadedFile } from "@/components/shared/file-upload";
import { Spinner } from "@/components/ui/spinner";
import { addMaintenancePhotosAction, removeMaintenancePhotoAction } from "@/app/(app)/operations/actions";
import { PhotoUploader } from "./photo-uploader";

export type GalleryPhoto = { id: string; originalName: string; mimeType: string; size: number };

/** Photo grid with a lightbox; managers/assignees can add photos, managers can remove them. */
export function PhotoGallery({
  requestId,
  photos,
  canAdd,
  canRemove,
}: {
  requestId: string;
  photos: GalleryPhoto[];
  canAdd: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [index, setIndex] = useState<number | null>(null);
  const [pendingUploads, setPendingUploads] = useState<UploadedFile[]>([]);
  const [saving, startSaving] = useTransition();
  const current = index !== null ? photos[index] : undefined;

  const save = () =>
    startSaving(async () => {
      try {
        const result = await addMaintenancePhotosAction(requestId, { photoFileIds: pendingUploads.map((p) => p.id) });
        if (result.ok) {
          toast.success(result.message ?? "Photos added");
          setPendingUploads([]);
          router.refresh();
        } else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  return (
    <div className="flex flex-col gap-3">
      {photos.length === 0 && !canAdd ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-6 text-sm text-muted-foreground">
          <ImageOff className="size-5" />
          No photos attached
        </div>
      ) : null}
      {photos.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              className="aspect-square overflow-hidden rounded-lg border bg-muted transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={`Open ${p.originalName}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route */}
              <img src={`/api/files/${p.id}`} alt={p.originalName} loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      {canAdd ? (
        <div className="flex flex-col gap-2">
          <PhotoUploader value={pendingUploads} onChange={setPendingUploads} max={Math.max(0, Math.min(10, 20 - photos.length))} />
          {pendingUploads.length ? (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPendingUploads([])} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Spinner /> : null}
                Attach {pendingUploads.length} photo{pendingUploads.length === 1 ? "" : "s"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={index !== null} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent className="max-w-[min(96vw,64rem)] gap-3 p-3 sm:max-w-[min(96vw,64rem)]">
          <DialogTitle className="truncate pe-8 text-sm">{current?.originalName ?? "Photo"}</DialogTitle>
          {current ? (
            <div className="relative flex items-center justify-center rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route */}
              <img src={`/api/files/${current.id}`} alt={current.originalName} className="max-h-[75dvh] w-auto rounded-lg object-contain" />
              {photos.length > 1 ? (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute start-2 top-1/2 -translate-y-1/2 rounded-full"
                    onClick={() => setIndex((i) => (i === null ? 0 : (i - 1 + photos.length) % photos.length))}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="rtl:rotate-180" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full"
                    onClick={() => setIndex((i) => (i === null ? 0 : (i + 1) % photos.length))}
                    aria-label="Next photo"
                  >
                    <ChevronRight className="rtl:rotate-180" />
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {current ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground tabular">
                {(index ?? 0) + 1} / {photos.length} · {Math.ceil(current.size / 1024)} KB
              </span>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/files/${current.id}?download=1`}>
                    <Download />
                    Download
                  </a>
                </Button>
                {canRemove ? (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm" className="text-destructive">
                        <Trash2 />
                        Remove
                      </Button>
                    }
                    title="Remove this photo?"
                    description="It will no longer appear on the request."
                    confirmLabel="Remove"
                    destructive
                    action={() => removeMaintenancePhotoAction(requestId, current.id)}
                    onSuccess={() => setIndex(null)}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
