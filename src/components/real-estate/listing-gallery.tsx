"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ImageOff, ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { StatusBadge } from "@/components/shared/status-badge";
import { addListingPhotosAction, removeListingPhotoAction, setListingCoverAction } from "@/app/(app)/listings/actions";
import { cn } from "@/lib/utils";

export type ListingPhoto = { id: string; originalName: string; mimeType: string; size: number };

/** Upload one image to private storage for a listing (attached by the server afterwards). */
async function uploadListingPhoto(file: File): Promise<string> {
  const body = new FormData();
  body.set("file", file);
  body.set("purpose", "listing-photo");
  const res = await fetch("/api/files", { method: "POST", body });
  const json = (await res.json().catch(() => null)) as { data?: { id: string }; error?: { message: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Upload failed");
  return json.data.id;
}

/**
 * Listing photo gallery: a large cover, thumbnails, lightbox, and (for
 * managers) upload, choose cover and remove.
 */
export function ListingGallery({
  listingId,
  title,
  photos,
  coverFileId,
  canManage,
  max,
}: {
  listingId: string;
  title: string;
  photos: ListingPhoto[];
  coverFileId: string | null;
  canManage: boolean;
  max: number;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(0);
  const [busy, startBusy] = useTransition();
  const ordered = [...photos].sort((a, b) => (a.id === coverFileId ? -1 : b.id === coverFileId ? 1 : 0));
  const current = index !== null ? ordered[index] : undefined;
  const remaining = max - photos.length;

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, Math.max(0, remaining));
    if (list.length > files.length) toast.error(`A listing can have up to ${max} photos.`);
    if (files.length === 0) return;
    setUploading(files.length);
    const ids: string[] = [];
    for (const file of files) {
      try {
        ids.push(await uploadListingPhoto(file));
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "Upload failed"}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
    if (ids.length === 0) return;
    startBusy(async () => {
      try {
        const result = await addListingPhotosAction(listingId, { photoFileIds: ids });
        if (result.ok) {
          toast.success(`${ids.length} photo${ids.length === 1 ? "" : "s"} added`);
          router.refresh();
        } else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });
  };

  const makeCover = (fileId: string) =>
    startBusy(async () => {
      try {
        const result = await setListingCoverAction(listingId, { fileId });
        if (result.ok) {
          toast.success(result.message ?? "Cover updated");
          router.refresh();
        } else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  const working = uploading > 0 || busy;
  const [cover, ...rest] = ordered;

  return (
    <div className="flex flex-col gap-3">
      {cover ? (
        <button
          type="button"
          onClick={() => setIndex(0)}
          className="relative aspect-16/9 overflow-hidden rounded-xl border bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label="Open photos"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route */}
          <img src={`/api/files/${cover.id}`} alt={title} className="size-full object-cover" />
          <span className="absolute end-2 bottom-2 rounded-full bg-background/90 px-2 py-0.5 text-xs tabular shadow-sm">
            {photos.length} photo{photos.length === 1 ? "" : "s"}
          </span>
        </button>
      ) : (
        <div className="flex aspect-16/9 flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-muted/40 text-sm text-muted-foreground">
          <ImageOff className="size-6" />
          No photos yet
        </div>
      )}

      {rest.length || (canManage && remaining > 0) ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {rest.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i + 1)}
              className="aspect-square overflow-hidden rounded-lg border bg-muted transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={`Open ${p.originalName}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route */}
              <img src={`/api/files/${p.id}`} alt={p.originalName} loading="lazy" className="size-full object-cover" />
            </button>
          ))}
          {canManage && remaining > 0 ? (
            <>
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => void pick(e.target.files)}
                disabled={working}
              />
              <button
                type="button"
                disabled={working}
                onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void pick(e.dataTransfer.files);
                }}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 disabled:opacity-60"
              >
                {working ? <Spinner /> : <ImagePlus className="size-5" />}
                <span className="font-medium text-foreground">{uploading > 0 ? "Uploading…" : "Add photos"}</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {canManage ? (
        <p className="text-xs text-muted-foreground">
          JPG, PNG or WebP · 10 MB each · {photos.length}/{max} photos. Open a photo to make it the cover or remove it.
        </p>
      ) : null}

      <Dialog open={index !== null} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent className="max-w-[min(96vw,64rem)] gap-3 p-3 sm:max-w-[min(96vw,64rem)]">
          <DialogTitle className="flex items-center gap-2 truncate pe-8 text-sm">
            {current?.originalName ?? "Photo"}
            {current?.id === coverFileId ? <StatusBadge tone="info">Cover</StatusBadge> : null}
          </DialogTitle>
          {current ? (
            <div className="relative flex items-center justify-center rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route */}
              <img src={`/api/files/${current.id}`} alt={current.originalName} className="max-h-[75dvh] w-auto rounded-lg object-contain" />
              {ordered.length > 1 ? (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute start-2 top-1/2 -translate-y-1/2 rounded-full"
                    onClick={() => setIndex((i) => (i === null ? 0 : (i - 1 + ordered.length) % ordered.length))}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="rtl:rotate-180" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full"
                    onClick={() => setIndex((i) => (i === null ? 0 : (i + 1) % ordered.length))}
                    aria-label="Next photo"
                  >
                    <ChevronRight className="rtl:rotate-180" />
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {current ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground tabular">
                {(index ?? 0) + 1} / {ordered.length}
              </span>
              {canManage ? (
                <div className={cn("flex gap-2", busy && "pointer-events-none opacity-60")}>
                  {current.id !== coverFileId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        makeCover(current.id);
                        setIndex(null);
                      }}
                    >
                      <Star />
                      Make cover
                    </Button>
                  ) : null}
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm" className="text-destructive">
                        <Trash2 />
                        Remove
                      </Button>
                    }
                    title="Remove this photo?"
                    description="It will no longer appear on the listing or the public page."
                    confirmLabel="Remove"
                    destructive
                    action={() => removeListingPhotoAction(listingId, current.id)}
                    onSuccess={() => setIndex(null)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
