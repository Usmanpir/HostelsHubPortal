"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Listing photo gallery with a keyboard-accessible lightbox:
 * Enter/Space opens a photo, ←/→ move between photos, Esc closes (focus returns to the thumbnail).
 */
export function Gallery({ title, photos }: { title: string; photos: string[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const count = photos.length;

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);
  const show = (i: number) => {
    setIndex(i);
    setOpen(true);
  };

  if (count === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
        <ImageOff className="size-10" aria-hidden />
        <span className="sr-only">No photos yet</span>
      </div>
    );
  }

  const extra = photos.slice(1, 5);
  return (
    <>
      <div className={cn("grid gap-2", extra.length ? "md:grid-cols-4 md:grid-rows-2" : "")}>
        <button
          type="button"
          onClick={() => show(0)}
          className={cn(
            "group relative overflow-hidden rounded-2xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            extra.length ? "aspect-[4/3] md:col-span-2 md:row-span-2 md:aspect-auto" : "aspect-[16/9]",
          )}
          aria-label={`Open photo 1 of ${count}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- authorized public image route */}
          <img src={photos[0]} alt={`${title} — photo 1`} className="size-full object-cover" fetchPriority="high" />
          <span className="absolute bottom-3 end-3 inline-flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
            <Expand className="size-3.5" aria-hidden />
            {count} photo{count === 1 ? "" : "s"}
          </span>
        </button>
        {extra.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => show(i + 1)}
            className="relative hidden aspect-[4/3] overflow-hidden rounded-2xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:block"
            aria-label={`Open photo ${i + 2} of ${count}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- authorized public image route */}
            <img src={src} alt="" loading="lazy" className="size-full object-cover" />
            {i === extra.length - 1 && count > 5 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-medium text-white">
                +{count - 5} more
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[calc(100%-1rem)] gap-3 bg-background p-2 sm:max-w-5xl sm:p-3"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              go(1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              go(-1);
            }
          }}
        >
          <DialogTitle className="sr-only">{title} photos</DialogTitle>
          <DialogDescription className="sr-only">Use the left and right arrow keys to browse photos.</DialogDescription>
          <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- authorized public image route */}
            <img
              key={photos[index]}
              src={photos[index]}
              alt={`${title} — photo ${index + 1} of ${count}`}
              className="max-h-[75dvh] w-auto max-w-full object-contain"
            />
            {count > 1 ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute start-2 top-1/2 -translate-y-1/2 rounded-full shadow"
                  onClick={() => go(-1)}
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="rtl:rotate-180" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full shadow"
                  onClick={() => go(1)}
                  aria-label="Next photo"
                >
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              </>
            ) : null}
          </div>
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Photo {index + 1} of {count}
          </p>
          {count > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="All photos">
              {photos.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  role="listitem"
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  className={cn(
                    "size-14 shrink-0 overflow-hidden rounded-md outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
                    i === index ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authorized public image route */}
                  <img src={src} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
