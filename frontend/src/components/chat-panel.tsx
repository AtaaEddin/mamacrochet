"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  ImageOff,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { MamaMark } from "@/components/illustrations/mama-mark";
import { productTitle, type ProductDto } from "@/lib/catalog/localize";
import { toWorkDisplay } from "@/lib/catalog/display";
import { fetchChatProducts } from "@/lib/chat/products";
import { CHAT_FILE_ACCEPT, useChat, type UiMessage } from "@/lib/chat/use-chat";
import { OrderProductActions } from "@/components/orders/order-product-actions";
import { cn } from "@/lib/utils";

/** Drag-and-drop payload key (product id) — rail card → conversation. */
export const WORK_DRAG_TYPE = "text/mamacrochet-work";

const RAIL_PRODUCT_LIMIT = 12;

/**
 * The big chat surface — mamacrochet is a chat-first platform (brand v2).
 *
 * Look: ChatGPT-style thread — centered column (max-w-2xl), Mama's
 * messages as avatar + plain text, visitor messages as soft bubbles, one
 * rounded composer box. With `withProductRail` (the chat page) the free
 * space becomes a **product rail**: browse real works and add one to the
 * conversation by tap or drag-and-drop.
 *
 * Plan 06: the local echo is gone — this is the live thread. Guest mode
 * runs the device's visitor thread over a thread token; user mode runs the
 * given thread over the cookie. Socket first, REST poll fallback.
 */
export function ChatPanel({
  mode,
  threadId = null,
  initialProductId = null,
  onGuestThread,
  withProductRail = false,
}: {
  mode: "guest" | "user";
  threadId?: string | null;
  /** A work the visitor arrived with (e.g. ?work=) — sent once, as a product message. */
  initialProductId?: string | null;
  onGuestThread?: (threadId: string) => void;
  withProductRail?: boolean;
}) {
  const t = useTranslations("ChatPanel");
  const locale = useLocale();
  const chat = useChat({ mode, threadId, onGuestThread });
  const { error: chatError, clearError } = chat;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerProducts, setPickerProducts] = useState<ProductDto[] | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const sentInitialRef = useRef(false);

  const fmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
    [locale],
  );

  // ---- Product data (picker + product bubbles) ------------------------------

  const productMap = useMemo(() => {
    const map = new Map<string, ProductDto>();
    for (const p of pickerProducts ?? []) map.set(p.id, p);
    return map;
  }, [pickerProducts]);

  const productIdsInThread = useMemo(
    () =>
      Array.from(
        new Set(
          chat.messages
            .map((m) => m.productId)
            .filter((id): id is string => id !== null && !productMap.has(id)),
        ),
      ),
    [chat.messages, productMap],
  );

  // Load product data when it is needed (the picker opens, the rail is
  // visible, or a message references a work). The setState lives inside the
  // promise callback, so the effect only *subscribes* — no synchronous
  // setState, and a cancelled unmount never writes state.
  const productsNeeded =
    withProductRail || pickerOpen || productIdsInThread.length > 0;
  useEffect(() => {
    if (!productsNeeded || pickerProducts !== null) return;
    let cancelled = false;
    void fetchChatProducts(RAIL_PRODUCT_LIMIT).then((products) => {
      if (!cancelled) setPickerProducts(products);
    });
    return () => {
      cancelled = true;
    };
  }, [productsNeeded, pickerProducts]);

  // ---- Transient errors -------------------------------------------------------

  useEffect(() => {
    if (!chatError) return;
    const timer = setTimeout(() => clearError(), 6_000);
    return () => clearTimeout(timer);
  }, [chatError, clearError]);

  // ---- Scroll ------------------------------------------------------------------

  const nearBottom = useRef(true);
  useEffect(() => {
    const el = threadRef.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages, pickerOpen]);

  // ---- The ?work= deep link ------------------------------------------------------

  useEffect(() => {
    if (!initialProductId || sentInitialRef.current) return;
    if (chat.status === "live" && !chat.loadingHistory) {
      sentInitialRef.current = true;
      void chat.send({ text: "", productId: initialProductId, files: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status, chat.loadingHistory, initialProductId]);

  // ---- Actions ---------------------------------------------------------------------

  const sendText = async (text: string, productId?: string) => {
    if (sending) return;
    setSending(true);
    try {
      const ok = await chat.send({ text, productId: productId ?? null, files: [] });
      if (ok && inputRef.current) inputRef.current.value = "";
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const sendFiles = async () => {
    if (sending || chat.pendingFiles.length === 0) return;
    const files = chat.pendingFiles;
    setSending(true);
    try {
      await chat.send({ text: "", files });
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    chat.addFiles(Array.from(list));
    if (fileRef.current) fileRef.current.value = "";
  };

  const closed = chat.thread?.isClosed ?? false;

  const statusLine =
    chat.status === "live"
      ? t("statusLive")
      : chat.status === "connecting"
        ? t("statusConnecting")
        : chat.status === "polling"
          ? t("statusPolling")
          : chat.status === "closed"
            ? t("statusClosed")
            : t("statusError");

  const chips = [t("chipCustom"), t("chipTrack"), t("chipDelivery")];

  const filteredPicker = (pickerProducts ?? []).filter((p) =>
    productTitle(p, locale).toLowerCase().includes(pickerQuery.trim().toLowerCase()),
  );

  return (
    <section
      aria-label={t("label")}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-lg",
        dragging && "border-primary ring-2 ring-ring/50",
      )}
    >
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <MamaMark className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold leading-tight">
            {t("title")}
            {chat.thread?.subject ? (
              <span className="ml-2 text-sm font-medium text-muted-foreground">
                · {chat.thread.subject}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                chat.status === "live" && "bg-brand-olive",
                chat.status === "connecting" && "bg-brand-gold",
                chat.status === "polling" && "bg-brand-gold",
                (chat.status === "closed" || chat.status === "error") && "bg-muted-foreground/40",
              )}
              aria-hidden="true"
            />
            <span className="truncate">{statusLine}</span>
          </p>
        </div>
        {chat.status === "error" && (
          <button
            type="button"
            onClick={chat.reconnect}
            aria-label={t("retry")}
            title={t("retry")}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Conversation column */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(WORK_DRAG_TYPE)) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const id = e.dataTransfer.getData(WORK_DRAG_TYPE);
            if (id) void sendText("", id);
          }}
        >
          {/* Thread — centered column, ChatGPT-style */}
          <div
            ref={threadRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            aria-live="polite"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">
              {closed && (
                <p className="self-center rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-muted-foreground">
                  {t("closedBanner")}
                </p>
              )}

              {chat.hasOlder && (
                <div className="self-center">
                  <button
                    type="button"
                    onClick={() => void chat.loadOlder()}
                    disabled={chat.loadingHistory}
                    className="rounded-full border border-border/70 bg-background px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {t("loadOlder")}
                  </button>
                </div>
              )}

              {chat.messages.length === 0 && !chat.loadingHistory && (
                <div className="mt-10 flex flex-col items-center gap-3 text-center">
                  <MamaMark className="size-14 opacity-80" />
                  <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {mode === "guest" ? t("opener") : t("emptyThread")}
                  </p>
                </div>
              )}

              {chat.messages.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  locale={locale}
                  product={m.productId ? productMap.get(m.productId) ?? null : null}
                  fmt={fmt}
                  lightbox={setLightbox}
                  onRetry={() => chat.retry(m.clientId ?? m.id)}
                />
              ))}
            </div>
          </div>

          {/* Quick topics + product search + composer */}
          <div className="mx-auto w-full max-w-2xl px-4 pb-4 sm:px-6">
            {chat.error && (
              <p
                role="alert"
                className="mb-2 rounded-full bg-destructive/10 px-4 py-2 text-center text-xs font-semibold text-destructive"
              >
                {chat.error}
              </p>
            )}

            {!closed && chat.status !== "error" && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void sendText(chip)}
                    className={cn(
                      "rounded-full border border-border/70 bg-background px-3 py-2 text-xs font-semibold text-foreground",
                      "transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    )}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {pickerOpen && (
              <div className="mb-2 animate-fade-in rounded-[1.75rem] border border-border/80 bg-background p-3 shadow-md motion-reduce:animate-none">
                <div className="flex items-center gap-2">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    autoFocus
                    type="search"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder={t("pickerSearch")}
                    aria-label={t("pickerSearch")}
                    className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPickerOpen(false);
                      setPickerQuery("");
                    }}
                    aria-label={t("pickerClose")}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-2 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                  {(pickerProducts ?? []).length === 0 && (
                    <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
                      {pickerProducts === null ? t("pickerLoading") : t("pickerEmpty")}
                    </p>
                  )}
                  {filteredPicker.map((p) => {
                    const work = toWorkDisplay(p, productTitle(p, locale));
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPickerOpen(false);
                          setPickerQuery("");
                          void sendText("", p.id);
                        }}
                        title={productTitle(p, locale)}
                        className="flex items-center gap-2 rounded-2xl border border-border/60 p-2 text-start transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted/60">
                          {work.imageSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element -- catalog images are API files
                            <img
                              src={work.imageSrc}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageOff className="size-4 text-muted-foreground/50" aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold">
                            {work.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {fmt.format(work.priceUsd)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {chat.pendingFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {chat.pendingFiles.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background py-1 pe-1 ps-3 text-xs font-semibold"
                  >
                    <span className="max-w-32 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => chat.removeFile(i)}
                      aria-label={t("removeFile")}
                      className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {closed ? (
              <p className="rounded-[1.75rem] border border-border/80 bg-background px-5 py-4 text-center text-sm text-muted-foreground">
                {t("closedComposer")}
              </p>
            ) : (
              <form
                className="flex items-end gap-2 rounded-[1.75rem] border border-border/80 bg-background p-2.5 shadow-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (chat.pendingFiles.length > 0) void sendFiles();
                  else void sendText(inputRef.current?.value ?? "");
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={CHAT_FILE_ACCEPT}
                  className="sr-only"
                  onChange={(e) => onPickFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen((v) => !v);
                    setPickerQuery("");
                  }}
                  aria-label={t("pickerLabel")}
                  aria-expanded={pickerOpen}
                  title={t("pickerLabel")}
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    pickerOpen
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Search className="size-4.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label={t("attach")}
                  title={t("attach")}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  <Paperclip className="size-4.5" aria-hidden="true" />
                </button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (chat.pendingFiles.length > 0) void sendFiles();
                      else void sendText(inputRef.current?.value ?? "");
                    }
                  }}
                  placeholder={t("placeholder")}
                  aria-label={t("placeholder")}
                  className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-snug placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending}
                  aria-label={t("send")}
                  title={t("send")}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  <Send className="size-4.5 rtl:-scale-x-100" aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Product rail — real works you can add to the conversation */}
        {withProductRail && (
          <ProductRail
            products={pickerProducts}
            locale={locale}
            fmt={fmt}
            onPick={(id) => void sendText("", id)}
          />
        )}
      </div>

      {/* Image lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-label={lightbox.label}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- chat files are API files */}
          <img
            src={lightbox.url}
            alt={lightbox.label}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label={t("closeLightbox")}
            className="absolute top-4 end-4 grid size-11 place-items-center rounded-full bg-background/90 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

// ---- Message rows -------------------------------------------------------------

function MessageRow({
  message: m,
  locale,
  product,
  fmt,
  lightbox,
  onRetry,
}: {
  message: UiMessage;
  locale: string;
  product: ProductDto | null;
  fmt: Intl.NumberFormat;
  lightbox: (lb: { url: string; label: string }) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("ChatPanel");
  // Guest mode: the visitor's own side. User mode: customer-side messages
  // (the signed-in customer in an order thread) sit on their side.
  const mine = m.senderRole === "guest" || m.senderRole === "customer";
  const staff = m.senderRole === "employee" || m.senderRole === "admin";

  if (mine) {
    return (
      <div className={cn("self-end", m.pending && "opacity-60")}>
        <div className="max-w-[85%] rounded-3xl bg-muted px-4 py-2.5">
          {product ? (
            <>
              <ProductBubble product={product} productName={m.productName} locale={locale} fmt={fmt} />
              <OrderProductActions product={product} locale={locale} />
            </>
          ) : (
            <>
              {m.body && (
                <p className="max-w-[85%] whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                  {m.body}
                </p>
              )}
              <Attachments attachments={m.attachments} lightbox={lightbox} />
            </>
          )}
          {m.pending && !m.failed && (
            <p className="mt-1 text-end text-[10px] font-semibold text-muted-foreground">{t("sending")}</p>
          )}
          {m.failed && (
            <p className="mt-1 flex items-center justify-end gap-2 text-[11px] font-bold text-destructive">
              {t("sendFailed")}
              <button type="button" onClick={onRetry} className="underline underline-offset-2">
                {t("retrySend")}
              </button>
            </p>
          )}
        </div>
      </div>
    );
  }

  const name = m.senderName || t("title");
  return (
    <div className={cn("flex gap-3", m.pending && "opacity-60")}>
      <MamaMark className="mt-0.5 size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        {staff && (
          <p className="mb-0.5 flex flex-wrap items-center gap-1.5 text-xs font-bold text-muted-foreground">
            {name}
            {m.senderRole === "admin" && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">
                {t("adminBadge")}
              </span>
            )}
          </p>
        )}
        {product ? (
          <div className="max-w-sm">
            <ProductBubble product={product} productName={m.productName} locale={locale} fmt={fmt} />
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
            {m.body}
          </p>
        )}
        <Attachments attachments={m.attachments} lightbox={lightbox} />
        {m.failed && (
          <p className="mt-1 flex items-center gap-2 text-[11px] font-bold text-destructive">
            {t("sendFailed")}
            <button type="button" onClick={onRetry} className="underline underline-offset-2">
              {t("retrySend")}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

function ProductBubble({
  product,
  productName,
  locale,
  fmt,
}: {
  product: ProductDto | null;
  productName: string | null;
  locale: string;
  fmt: Intl.NumberFormat;
}) {
  if (!product) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/60 px-3 py-1 text-xs font-bold text-accent-foreground">
        <Plus className="size-3" aria-hidden="true" />
        {productName ?? "—"}
      </span>
    );
  }
  const work = toWorkDisplay(product, productTitle(product, locale));
  return (
    <div className="rounded-3xl border border-border/70 bg-background p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted/60">
          {work.imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- catalog images are API files
            <img src={work.imageSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="size-4 text-muted-foreground/50" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{work.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {work.inStock ? "✓" : "·"} {fmt.format(work.priceUsd)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Attachments({
  attachments,
  lightbox,
}: {
  attachments: { url: string; contentType: string; originalName: string }[];
  lightbox: (lb: { url: string; label: string }) => void;
}) {
  const t = useTranslations("ChatPanel");
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => a.contentType.startsWith("image/"));
  const pdfs = attachments.filter((a) => a.contentType === "application/pdf");
  return (
    <div className="mt-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {images.map((a) => (
            <button
              key={a.url}
              type="button"
              onClick={() => lightbox({ url: a.url, label: a.originalName })}
              className="overflow-hidden rounded-xl border border-border/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label={a.originalName}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- chat files are API files */}
              <img src={a.url} alt={a.originalName} className="h-28 w-28 object-cover" />
            </button>
          ))}
        </div>
      )}
      {pdfs.map((a) => (
        <a
          key={a.url}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <FileText className="size-3.5" aria-hidden="true" />
          {a.originalName}
          <span className="text-muted-foreground">({t("openPdf")})</span>
        </a>
      ))}
    </div>
  );
}

// ---- Product rail (real catalog) -------------------------------------------------

function ProductRail({
  products,
  locale,
  fmt,
  onPick,
}: {
  products: ProductDto[] | null;
  locale: string;
  fmt: Intl.NumberFormat;
  onPick: (productId: string) => void;
}) {
  const t = useTranslations("ChatPanel");

  return (
    <aside
      aria-label={t("railTitle")}
      className="min-h-0 max-h-[36dvh] shrink-0 overflow-y-auto border-t border-border/60 bg-background/40 p-4 lg:max-h-none lg:w-[340px] lg:border-s lg:border-t-0"
    >
      <p className="font-display text-sm font-bold">{t("railTitle")}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("railHint")}</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
        {(products ?? []).map((p) => {
          const work = toWorkDisplay(p, productTitle(p, locale));
          return (
            <li key={p.id}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(WORK_DRAG_TYPE, p.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onPick(p.id)}
                title={work.title}
                className="group flex w-full items-center gap-2 rounded-3xl border border-border/60 bg-card p-2 text-start transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:shadow-md"
              >
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted/60">
                  {work.imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element -- catalog images are API files
                    <img src={work.imageSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff className="size-4 text-muted-foreground/50" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">{work.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {fmt.format(work.priceUsd)}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground opacity-80 transition-opacity group-hover:opacity-100"
                >
                  <Plus className="size-4" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {(products ?? []).length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {products === null ? t("pickerLoading") : t("pickerEmpty")}
        </p>
      )}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ChevronDown className="size-3.5 rotate-90" aria-hidden="true" />
        {t("railFoot")}
      </p>
    </aside>
  );
}
