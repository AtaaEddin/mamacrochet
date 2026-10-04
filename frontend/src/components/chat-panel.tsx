"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  Home,
  ImageOff,
  Inbox,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import { fileSrc } from "@/lib/api/client";
import { productTitle, type ProductDto } from "@/lib/catalog/localize";
import { toWorkDisplay } from "@/lib/catalog/display";
import { fetchChatProducts } from "@/lib/chat/products";
import { CHAT_FILE_ACCEPT, useChat, type UiMessage } from "@/lib/chat/use-chat";
import { OrderProductActions } from "@/components/orders/order-product-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import * as chatApi from "@/lib/chat/api";

/** Drag-and-drop payload key (product id) — rail card → conversation. */
export const WORK_DRAG_TYPE = "text/hanadicrochet-work";

const RAIL_PRODUCT_LIMIT = 12;

const NAV_BTN =
  "grid size-11 place-items-center rounded-full text-foreground transition-colors " +
  "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

/**
 * The chat app screen (plan 20261002-1847, sub 01) — hanadicrochet is a
 * chat-first platform (brand v2).
 *
 * One full-viewport surface, four bordered parts — the page itself never
 * scrolls, the input is always visible:
 *
 *   TOP BAR   [←] [logo] ············  [home] [works]   (slim, border-b)
 *   LEFT      conversations list (scrolls; + New = sub 02)
 *   MIDDLE    the thread (ChatGPT-style bubbles, scrolls)
 *   RIGHT     works rail — real catalog (scrolls, "the side" list)
 *   BOTTOM    composer (border-t, always visible)
 *
 * Mobile (<lg): the list is a step, not a pane — conversations ⇄ thread,
 * the works stay in the composer's search button. Guests skip the list
 * (one active visitor thread per device, D16).
 *
 * Look: thread as avatar + plain text (Hanadi) / soft bubbles (visitor),
 * one rounded composer box. No wordmark, no status line in the top bar
 * (owner 2026-10-02) — the retry button appears there only on connection
 * error. Live thread over socket, REST poll fallback.
 */
export function ChatPanel({
  mode,
  threadId,
  initialProductId = null,
  onInitialProductSent,
  onGuestThread,
  withProductRail = false,
  canOpenUnclaimed = true,
  backLabel,
  onBack,
  onCloseThread,
  onOpenThread,
  onNewConversation,
  onAutoOpenThread,
  notice,
}: {
  mode: "guest" | "user";
  /** user mode: the thread to open (`?thread=`); null = none open. */
  threadId: string | null;
  /** A work the visitor arrived with (e.g. ?work=) — sent once, as a product message. */
  initialProductId?: string | null;
  /**
   * Sub-plan 04: called once the ?work= product message is accepted, so the
   * page can drop ?work= from the URL (a refresh then never re-sends it).
   */
  onInitialProductSent?: () => void;
  onGuestThread?: (threadId: string) => void;
  withProductRail?: boolean;
  /**
   * Sub-plan 02: may this user open unclaimed (assignee-less) threads
   * directly? Admins + customers: yes. Plain employees: no — auto-open
   * skips them, and an explicit open claims first (page/inbox wrap
   * onOpenThread for the claim).
   */
  canOpenUnclaimed?: boolean;
  /** Top-bar Back — aria-label + title. */
  backLabel: string;
  /** Page-level Back (previous page, or Home). */
  onBack: () => void;
  /** Mobile: Back from an open thread returns to the conversation list. */
  onCloseThread?: () => void;
  /** Open a conversation from the list (user mode); the page decides any
   *  staff claim-first logic (sub-plan 02). */
  onOpenThread?: (item: chatApi.ChatThreadListItem) => void;
  /** List-header action (sub-plan 02: "New conversation"). */
  onNewConversation?: () => void;
  /**
   * Sub-plan 03: user arrives at /chat with no `?thread=` → open the latest
   * open conversation instead of "pick a conversation" (one-shot per
   * mount; Back to the list must not re-trigger).
   */
  onAutoOpenThread?: (threadId: string) => void;
  /** Notice row above the composer (e.g. a failed New conversation, sub 02). */
  notice?: string | null;
}) {
  const t = useTranslations("ChatPanel");
  const locale = useLocale();
  const chat = useChat({ mode, threadId, onGuestThread });
  const { error: chatError, clearError } = chat;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerProducts, setPickerProducts] = useState<ProductDto[] | null>(null);
  const [threads, setThreads] = useState<chatApi.ChatThreadListItem[] | null>(null);
  const autoOpenedRef = useRef(false);
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);

  // Conversation management (plan 20261003-2254 sub 02): the customer's
  // delete (user mode) and the guest "new conversation" (capped reset).
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [guestResetOpen, setGuestResetOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const sentInitialRef = useRef(false);

  const fmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
    [locale],
  );

  const fmtTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return "";
    }
  };

  // The mobile "list step": users without an open thread see the
  // conversations full-screen first; everyone else goes straight to the
  // thread (guests have exactly one — D16).
  const listStep = mode === "user" && !threadId;

  // ---- Conversation list (LEFT pane / mobile step) --------------------------

  useEffect(() => {
    if (mode !== "user") return;
    let cancelled = false;
    const load = () => {
      void chatApi.fetchThreads().then((r) => {
        if (!cancelled && r.ok) setThreads(r.data.threads);
      });
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mode]);

  // ---- Auto-open the latest conversation (sub-plan 03) --------------------
  // A user coming back to /chat lands in their latest open conversation,
  // not on "pick a conversation". One-shot per mount: going Back to the
  // list (which removes `?thread=`) must not re-trigger it. The API list is
  // already ordered by last activity desc (ListThreadsAsync).
  // SKIPPED for ?work=: the page creates a fresh conversation for the work
  // (sub-plan 04), so auto-opening an old thread would race it.
  useEffect(() => {
    if (
      mode !== "user" ||
      threadId ||
      initialProductId ||
      autoOpenedRef.current ||
      threads === null
    ) {
      return;
    }
    // Sub-plan 02: auto-open must never grab an unclaimed visitor thread
    // for a plain employee (landing at /chat is not taking work); the
    // assignee-less rows in their list stay for an explicit, claiming open.
    const latest = threads.find(
      (item) => !item.isClosed && (canOpenUnclaimed || item.assigneeName !== null),
    );
    if (!latest) return;
    autoOpenedRef.current = true;
    onAutoOpenThread?.(latest.id);
  }, [mode, threadId, initialProductId, canOpenUnclaimed, threads, onAutoOpenThread]);

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
      void (async () => {
        // Sub-plan 04: once the work is accepted, drop ?work= from the URL so
        // a refresh never re-sends it (the one-shot guard stays as backstop).
        const ok = await chat.send({ text: "", productId: initialProductId, files: [] });
        if (ok) onInitialProductSent?.();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status, chat.loadingHistory, initialProductId]);

  // ---- Actions ---------------------------------------------------------------------

  // Customer delete (archive): hide the row from this customer's list.
  // Nothing is erased server-side; a later send re-opens the conversation.
  const confirmDelete = async (id: string) => {
    setDeleting(true);
    setDeleteError(null);
    const r = await chatApi.deleteThread(id);
    setDeleting(false);
    if (r.ok) {
      setDeleteTarget(null);
      setThreads((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
      // The deleted thread was the open one → back to the list.
      if (threadId === id) onCloseThread?.();
    } else {
      setDeleteError(r.error.message);
    }
  };

  const backAction = () => {
    // One level up: on a phone, an open thread goes back to the list;
    // everywhere else the page-level Back applies.
    if (
      mode === "user" &&
      threadId &&
      onCloseThread &&
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      onCloseThread();
      return;
    }
    onBack();
  };

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
  // Sub-plan 04: user mode with no thread open — the composer can't
  // deliver (the send would have nowhere to go); disable it instead of
  // letting send() silently no-op.
  const composerBlocked = closed || (mode === "user" && !threadId);

  const chips = [t("chipCustom"), t("chipTrack"), t("chipDelivery")];

  const filteredPicker = (pickerProducts ?? []).filter((p) =>
    productTitle(p, locale).toLowerCase().includes(pickerQuery.trim().toLowerCase()),
  );

  return (
    <section
      aria-label={t("label")}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        dragging && "ring-2 ring-ring/50",
      )}
    >
      {/* TOP BAR — back · logo · home · works (no wordmark, no status) */}
      <header data-chat-part="top" className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-background px-2">
        <button
          type="button"
          onClick={backAction}
          aria-label={backLabel}
          title={backLabel}
          className={NAV_BTN}
        >
          <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
        </button>
        <Image
          src="/brand/hanadi-mark.svg"
          alt=""
          aria-hidden="true"
          width={32}
          height={32}
          className="size-8 shrink-0"
        />
        <div className="min-w-0 flex-1" />
        <nav aria-label={t("exitLabel")} className="flex shrink-0 items-center gap-1.5">
          <Link href="/" aria-label={t("home")} title={t("home")} className={NAV_BTN}>
            <Home className="size-5" aria-hidden="true" />
          </Link>
          <Link href="/works" aria-label={t("works")} title={t("works")} className={NAV_BTN}>
            <ShoppingBag className="size-5" aria-hidden="true" />
          </Link>
        </nav>
        {mode === "guest" && (
          // The guest's "new conversation" (sub 02): the capped reset —
          // top bar, so it is reachable on phones too (guests have no
          // list step).
          <button
            type="button"
            onClick={() => setGuestResetOpen(true)}
            aria-label={t("newConversationGuest")}
            title={t("newConversationGuest")}
            className={NAV_BTN}
          >
            <Plus className="size-4.5" aria-hidden="true" />
          </button>
        )}
        {chat.status === "error" && (
          <button
            type="button"
            onClick={chat.reconnect}
            aria-label={t("retry")}
            title={t("retry")}
            className={NAV_BTN}
          >
            <RefreshCw className="size-5" aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* LEFT — conversation list (pane ≥lg, first step on mobile) */}
        <div
          data-chat-part="list"
          className={cn(
            "min-h-0 min-w-0 flex-col bg-background",
            listStep ? "flex flex-1" : "hidden",
            "lg:flex lg:w-[280px] xl:w-[320px] lg:flex-none lg:border-e lg:border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="truncate font-display text-sm font-bold">{t("listTitle")}</p>
            {onNewConversation && (
              <button
                type="button"
                onClick={onNewConversation}
                aria-label={t("newConversation")}
                title={t("newConversation")}
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <Plus className="size-4.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {mode === "guest" ? (
              chat.thread ? (
                <div
                  aria-current="true"
                  className="w-full rounded-2xl border border-border/60 bg-muted/70 p-3"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {chat.thread.subject || t("noSubject")}
                    </span>
                    {chat.thread.isClosed && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {t("closed")}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtTime(chat.thread.lastMessageAt)}
                    </span>
                  </span>
                </div>
              ) : (
                <span
                  aria-hidden="true"
                  className="mx-auto my-6 block size-6 animate-spin rounded-full border-2 border-border border-t-primary"
                />
              )
            ) : threads === null ? (
              <span
                aria-hidden="true"
                className="mx-auto my-6 block size-7 animate-spin rounded-full border-2 border-border border-t-primary"
              />
            ) : threads.length === 0 ? (
              <div className="mt-10 flex flex-col items-center gap-3 text-center">
                <Inbox className="size-10 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t("listEmpty")}</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {threads.map((item) => (
                  <li key={item.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => onOpenThread?.(item)}
                      aria-current={threadId === item.id ? "true" : undefined}
                      className={cn(
                        "min-w-0 flex-1 rounded-2xl border p-3 text-start transition-colors",
                        threadId === item.id
                          ? "border-border/60 bg-muted/70"
                          : "border-transparent hover:bg-muted/50",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">
                          {item.subject || t("noSubject")}
                        </span>
                        {item.isClosed && (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            {t("closed")}
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {fmtTime(item.lastMessageAt)}
                        </span>
                      </span>
                      {item.preview?.text ? (
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {item.preview.text}
                        </span>
                      ) : null}
                      {Number(item.unread) > 0 && (
                        <span className="mt-1.5 inline-grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                          {item.unread}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(item.id);
                      }}
                      aria-label={t("deleteConversation")}
                      title={t("deleteConversation")}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground/50 transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* MIDDLE — the thread (scrolls; the only tall scroll here) */}
        <div
          data-chat-part="thread"
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col bg-card",
            listStep ? "hidden lg:flex" : "flex",
          )}
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
          <div
            ref={threadRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            aria-live="polite"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {/* dir=ltr: the conversation geometry is fixed in every locale —
                customer side always right, staff (avatar) always left. The
                Arabic document direction would otherwise flip the sides. */}
            <div dir="ltr" className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">
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
                mode === "guest" || threadId ? (
                  <div className="mt-10 flex flex-col items-center gap-3 text-center">
                    <Image
                      src="/brand/hanadi-mark.svg"
                      alt=""
                      aria-hidden="true"
                      width={56}
                      height={56}
                      className="size-14 opacity-80"
                    />
                    <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                      {mode === "guest" ? t("opener") : t("emptyThread")}
                    </p>
                  </div>
                ) : (
                  <div className="mt-10 flex flex-col items-center gap-3 text-center">
                    <Inbox className="size-12 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">{t("pickConversation")}</p>
                  </div>
                )
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
        </div>

        {/* RIGHT — works rail (the side list; products below lg live in the
            composer's search button) */}
        {withProductRail && (
          <ProductRail
            products={pickerProducts}
            locale={locale}
            fmt={fmt}
            onPick={(id) => void sendText("", id)}
          />
        )}
      </div>

      {/* BOTTOM — composer (always visible) */}
      <div
        data-chat-part="bottom"
        className={cn(
          "shrink-0 border-t border-border bg-background",
          listStep ? "hidden lg:flex" : "flex",
        )}
      >
        <div className="mx-auto w-full max-w-2xl px-4 pb-3 pt-2 sm:px-6">
          {(chat.error || notice) && (
            <p
              role="alert"
              className="mb-2 rounded-full bg-destructive/10 px-4 py-2 text-center text-xs font-semibold text-destructive"
            >
              {chat.error ?? notice}
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
                    "rounded-full border border-border/70 bg-card/40 px-3 py-2 text-xs font-semibold text-foreground",
                    "transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {pickerOpen && (
            <div className="mb-2 animate-fade-in rounded-[1.75rem] border border-border/80 bg-card/40 p-3 shadow-md motion-reduce:animate-none">
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
                  className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/40 py-1 pe-1 ps-3 text-xs font-semibold"
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
            <p className="rounded-[1.75rem] border border-border/80 bg-card/40 px-5 py-4 text-center text-sm text-muted-foreground">
              {t("closedComposer")}
            </p>
          ) : (
            <form
              className="flex items-end gap-2 rounded-[1.75rem] border border-border bg-card p-2.5 shadow-sm"
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
                disabled={composerBlocked}
                onClick={() => {
                  setPickerOpen((v) => !v);
                  setPickerQuery("");
                }}
                aria-label={t("pickerLabel")}
                aria-expanded={pickerOpen}
                title={t("pickerLabel")}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                  pickerOpen
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Search className="size-4.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={composerBlocked}
                onClick={() => fileRef.current?.click()}
                aria-label={t("attach")}
                title={t("attach")}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
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
                disabled={composerBlocked}
                className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-snug placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || composerBlocked}
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

      {/* Customer delete (sub 02): the archive confirm. The dialog stays
          open on error; on success the row disappears (optimistic). */}
      {deleteTarget !== null && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("deleteConfirmBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {deleteError ? (
                <p role="alert" className="text-sm font-semibold text-destructive">
                  {deleteError}
                </p>
              ) : null}
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleting}
                onClick={() => {
                  const id = deleteTarget;
                  if (id) void confirmDelete(id);
                }}
              >
                {t("deleteConfirmAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Guest "new conversation" (sub 02): the capped reset confirm. On
          the 5/24 h cap the server keeps the old thread; the hook shows
          the 429 message in the notice row. */}
      {mode === "guest" && guestResetOpen && (
        <AlertDialog
          open
          onOpenChange={(open) => setGuestResetOpen(open)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("newConversationGuestTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("newConversationGuestBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setGuestResetOpen(false);
                  chat.resetGuestThread();
                }}
              >
                {t("newConversationGuestAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
                <p dir="auto" className="max-w-[85%] whitespace-pre-wrap break-words text-[15px] leading-relaxed">
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
      <Image
        src="/brand/hanadi-mark.svg"
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        className="mt-0.5 size-8 shrink-0"
      />
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
          <p dir="auto" className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
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
              onClick={() => lightbox({ url: fileSrc(a.url), label: a.originalName })}
              className="overflow-hidden rounded-xl border border-border/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label={a.originalName}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- chat files are API files */}
              <img src={fileSrc(a.url)} alt={a.originalName} className="h-28 w-28 object-cover" />
            </button>
          ))}
        </div>
      )}
      {pdfs.map((a) => (
        <a
          key={a.url}
          href={fileSrc(a.url)}
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

// ---- Works rail (real catalog) -------------------------------------------------

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
      data-chat-part="rail"
      aria-label={t("railTitle")}
      className="hidden min-h-0 shrink-0 overflow-y-auto border-s border-border bg-card/40 p-4 lg:flex lg:flex-col lg:w-[340px] xl:w-[380px]"
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
      {/* Ask 3: the foot is a real link to the works list (was plain text). */}
      <Link
        href="/works"
        aria-label={t("railFoot")}
        className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronDown className="size-3.5 rotate-90" aria-hidden="true" />
        {t("railFoot")}
      </Link>
    </aside>
  );
}
