"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getGuestId } from "@/lib/guest-id";
import { submitOrder, type ApiError } from "@/lib/orders/api";
import { cn } from "@/lib/utils";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  kind: "catalog" | "custom";
  /** Bought product (catalog) or referenced product (custom). */
  productId?: string | null;
  /** Localized product title, for context in the form header. */
  productName?: string | null;
  /** Prefilled spec text (product-based custom request). */
  defaultSpec?: string | null;
  /** Prefilled guest contact (logged-in account). */
  prefill?: { name?: string; phone?: string; email?: string };
  /** Called with the new order id on success. */
  onSuccess: (id: string) => void;
  className?: string;
};

/**
 * The guest-capable order form (plan 05). One component serves every
 * creation flow: `/request-custom` (custom spec + sample images) and the
 * in-chat product actions (catalog "order this" / custom "request this").
 *
 * Guest step = name + phone (required) + optional email, prefilled from the
 * profile when logged in. The device guest id is attached automatically
 * (D14); registration stays the gate at confirmation, not here.
 */
export function GuestOrderForm({
  kind,
  productId,
  productName,
  defaultSpec,
  prefill,
  onSuccess,
  className,
}: Props) {
  const t = useTranslations("Orders.create");
  const [name, setName] = useState(prefill?.name ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [spec, setSpec] = useState(defaultSpec ?? "");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);

  // Preview object URLs live as long as the form does; all are revoked on
  // unmount (the list in urlsRef is the source of truth for cleanup).
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFileError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) break;
      if (f.size > MAX_BYTES || !ALLOWED_TYPES.includes(f.type)) {
        setFileError(t("fileInvalid"));
        continue;
      }
      const url = URL.createObjectURL(f);
      urlsRef.current.push(url);
      next.push({ file: f, url });
    }
    if (next.length !== files.length) setFiles(next);
  };

  const removeFile = (index: number) => {
    const removed = files[index];
    if (removed) {
      URL.revokeObjectURL(removed.url);
      urlsRef.current = urlsRef.current.filter((u) => u !== removed.url);
    }
    setFiles((prev) => prev.filter((_, j) => j !== index));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await submitOrder({
        kind,
        productId,
        name,
        phone,
        email: email || undefined,
        guestId: getGuestId(),
        spec: spec || undefined,
        files: files.map((f) => f.file),
      });
      if (res.ok) {
        onSuccess(res.id);
      } else {
        setError(res.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn("space-y-4", className)}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="order-name">{t("nameLabel")}</Label>
            <Input
              id="order-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              aria-required="true"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-phone">{t("phoneLabel")}</Label>
            <Input
              id="order-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              autoComplete="tel"
              aria-required="true"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-email">
            {t("emailLabel")}
            <span className="text-muted-foreground"> ({t("optional")})</span>
          </Label>
          <Input
            id="order-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            autoComplete="email"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="order-spec">
          {kind === "catalog" ? t("noteLabel") : t("specLabel")}
        </Label>
        <Textarea
          id="order-spec"
          rows={kind === "catalog" ? 2 : 5}
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          required={kind === "custom"}
          maxLength={4000}
          placeholder={t("specPlaceholder")}
        />
      </div>

      {kind === "custom" && (
        <div className="space-y-1.5">
          <Label htmlFor="order-files">
            {t("photosLabel")}
            <span className="text-muted-foreground"> ({t("optional")})</span>
          </Label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            className="rounded-2xl border border-dashed border-border/80 bg-muted/30 p-3"
          >
            <input
              ref={fileInputRef}
              id="order-files"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Camera className="size-4" aria-hidden="true" />
              {t("photosPick")}
            </button>
            {files.length > 0 && (
              <ul className="mt-2 grid grid-cols-5 gap-1.5">
                {files.map((f, i) => (
                  <li key={`${f.file.name}-${i}`} className="relative">
                    <span className="block aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted">
                      {/* local object-URL preview */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={f.file.name}
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={t("removeFile")}
                      className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-foreground text-background"
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fileError ? (
              <p className="mt-1.5 text-xs font-semibold text-destructive">
                {fileError}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive"
        >
          {error.message || t("submitFailed")}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        {t("submit")}
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {kind === "catalog"
          ? t("hintCatalog")
          : productName
            ? t("hintCustomProduct", { name: productName })
            : t("hintCustom")}
      </p>
    </form>
  );
}


