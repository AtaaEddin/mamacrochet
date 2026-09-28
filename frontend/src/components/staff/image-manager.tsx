"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ProductImageDto } from "@/lib/staff/api";
import { uploadProductImages } from "@/lib/api/client";
import { deleteImage, reorderImages } from "@/lib/staff/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fileSrc } from "@/lib/catalog/display";

/**
 * Per-product photo manager (plan 04). The parent owns the image list (the
 * product's `images`, already in cover order); this component only mutates it
 * through onImagesChange. Upload is a multipart POST with the CSRF token
 * (client.ts wiring); reorder sends the full ordered id list (two-phase on
 * the server); the first image is the cover.
 */
export function ImageManager({
  productId,
  images,
  onImagesChange,
}: {
  productId: string;
  images: ProductImageDto[];
  onImagesChange: (images: ProductImageDto[]) => void;
}) {
  const t = useTranslations("Staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    input.value = "";
    setBusy(true);
    setError(null);
    const res = await uploadProductImages(productId, files);
    setBusy(false);
    if (res.ok) {
      onImagesChange(res.images);
    } else {
      setError(t("uploadError"));
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (busy) return;
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    setBusy(true);
    setError(null);
    const next = [...images];
    const a = next[index];
    const b = next[target];
    if (a === undefined || b === undefined) {
      setBusy(false);
      return;
    }
    next[index] = b;
    next[target] = a;
    const res = await reorderImages(productId, next.map((i) => i.id));
    setBusy(false);
    if (res.ok) onImagesChange(res.images);
    else setError(t("saveError"));
  }

  async function remove(imageId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await deleteImage(productId, imageId);
    setBusy(false);
    if (res.ok) onImagesChange(images.filter((i) => i.id !== imageId));
    else setError(t("deleteError"));
  }

  return (
    <div className="mt-6 border-t border-border/60 pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-extrabold">{t("images")}</h3>
        <label className="inline-flex">
          <span className="sr-only">{t("uploadPhotos")}</span>
          <Input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void upload(e)}
            disabled={busy}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={(e) => {
              // Trigger the hidden file input.
              const label = e.currentTarget.closest("label");
              const input = label?.querySelector("input");
              if (input instanceof HTMLInputElement) input.click();
            }}
          >
            {busy ? t("uploading") : t("uploadPhotos")}
          </Button>
        </label>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("uploadHint")}</p>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {images.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("noPhotos")}</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {images.map((img, index) => {
            const src = fileSrc(img.url) ?? img.url;
            const isCover = index === 0;
            return (
              <li
                key={img.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-2"
              >
                <span className="size-16 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element -- API file host */}
                  <img
                    src={src}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  {isCover ? (
                    <Badge variant="secondary" className="mb-1">
                      {t("coverBadge")}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={t("moveUp")}
                      disabled={busy || index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={t("moveDown")}
                      disabled={busy || index === images.length - 1}
                      onClick={() => void move(index, 1)}
                    >
                      ↓
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("deletePhoto")}
                    disabled={busy}
                    onClick={() => void remove(img.id)}
                  >
                    {t("deletePhoto")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
