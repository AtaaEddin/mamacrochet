"use client";

import { useState } from "react";
import { WorkArt } from "@/components/illustrations/work-art";
import type { WorkArtKind } from "@/lib/sample-works";
import { fileSrc } from "@/lib/catalog/display";
import { cn } from "@/lib/utils";

export interface GalleryImage {
  id: string;
  url: string;
  thumbUrl: string;
}

/**
 * Product image gallery (plan 04) — main image + thumbnail strip. Client
 * component (thumbnail selection). Images are API file paths resolved to
 * browser URLs. Falls back to an illustration / placeholder when empty.
 */
export function ImageGallery({
  images,
  title,
  art,
}: {
  images: GalleryImage[];
  title: string;
  art: WorkArtKind | null;
}) {
  const [active, setActive] = useState(0);
  const safeActive = images.length > 0 ? Math.min(active, images.length - 1) : -1;
  const current = images[safeActive];

  return (
    <div>
      <div className="aspect-square w-full overflow-hidden rounded-3xl border border-border/70 bg-muted/50">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- API file host
          <img
            src={current.url}
            alt={title}
            className="size-full object-cover"
            decoding="async"
          />
        ) : art ? (
          <div className="flex size-full items-center justify-center p-8">
            <WorkArt kind={art} className="size-full" />
          </div>
        ) : (
          <div className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">
            —
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Product photos">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              role="tab"
              aria-selected={i === safeActive}
              aria-label={`${title} — photo ${i + 1}`}
              onClick={() => setActive(i)}
              className={cn(
                "size-16 shrink-0 overflow-hidden rounded-2xl border-2 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                i === safeActive
                  ? "border-primary"
                  : "border-border/50 opacity-70 hover:opacity-100",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- API file host (thumb) */}
              <img
                src={fileSrc(img.thumbUrl) ?? img.thumbUrl}
                alt=""
                className="size-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
