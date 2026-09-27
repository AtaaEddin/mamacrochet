"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Star,
  X,
} from "lucide-react";
import { MamaMark } from "@/components/illustrations/mama-mark";
import { WorkArt } from "@/components/illustrations/work-art";
import { WorkCard } from "@/components/work-card";
import {
  WorkCategoryChips,
  type CategoryFilter,
} from "@/components/work-category-chips";
import {
  SAMPLE_WORKS,
  type SampleWork,
} from "@/lib/sample-works";
import { cn } from "@/lib/utils";

type Message = {
  id: number;
  from: "mama" | "me";
  text: string;
  /** A product the visitor searched for / picked / dragged into the chat. */
  product?: SampleWork;
};

/** Drag-and-drop payload key (work id). */
export const WORK_DRAG_TYPE = "text/mamacrochet-work";

/**
 * The big chat surface — mamacrochet is a chat-first platform (brand v2).
 *
 * Look: ChatGPT-style thread — centered column (max-w-2xl), Mama's
 * messages as avatar + plain text, visitor messages as soft bubbles, one
 * rounded composer box. With `withProductRail` (the chat page) the free
 * space becomes a **product rail**: browse/filter existing works and add
 * one to the conversation by tap or drag-and-drop.
 *
 * **Products live in the chat** (owner directive): search, pick or drag a
 * work into the conversation; a product message expands its info in place
 * — the visitor never leaves the chat.
 *
 * Currently a local-echo demo: plan 06 replaces it with guest/order
 * threads over SignalR, plan 04 with real products + dynamic search (D19).
 */
export function ChatPanel({
  initialProduct,
  withProductRail = false,
}: {
  initialProduct?: SampleWork;
  withProductRail?: boolean;
}) {
  const t = useTranslations("ChatPanel");
  const tWorks = useTranslations("Works");
  const locale = useLocale();
  const [messages, setMessages] = useState<Message[]>(() => {
    const base: Message[] = [
      { id: 0, from: "mama", text: t("opener") },
      { id: 1, from: "mama", text: t("photoHint") },
    ];
    if (initialProduct) {
      base.push({ id: 2, from: "me", text: "", product: initialProduct });
    }
    return base;
  });
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [railCategory, setRailCategory] = useState<CategoryFilter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(initialProduct ? 3 : 2);
  const replyCount = useRef(0);

  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  });

  // Follow new messages.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pickerOpen]);

  const pushReply = () => {
    const reply = t(replyCount.current++ % 2 === 0 ? "reply" : "replyAlt");
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { id: nextId.current++, from: "mama", text: reply }]);
    }, 700);
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: nextId.current++, from: "me", text: trimmed }]);
    setDraft("");
    pushReply();
  };

  /** Add a work to the conversation (picker, rail tap, or drop). */
  const addProduct = (work: SampleWork) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, from: "me", text: "", product: work },
    ]);
    setPickerOpen(false);
    setQuery("");
    setExpanded(null);
    pushReply();
  };

  const filteredPicker = SAMPLE_WORKS.filter((w) =>
    tWorks(`items.${w.nameKey}`).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const railWorks = SAMPLE_WORKS.filter(
    (w) => railCategory === "all" || w.category === railCategory,
  );

  const chips = [t("chipCustom"), t("chipTrack"), t("chipDelivery")];

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
          <p className="truncate font-display text-base font-bold leading-tight">{t("title")}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-brand-olive" aria-hidden="true" />
            <span className="truncate">{t("status")}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground">
          {t("comingSoon")}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Conversation column */}
        <div
          className="flex min-h-0 flex-1 flex-col"
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
            const work = SAMPLE_WORKS.find((w) => w.id === id);
            if (work) addProduct(work);
          }}
        >
          {/* Thread — centered column, ChatGPT-style */}
          <div ref={threadRef} aria-live="polite" className="min-h-[40vh] flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">
              {messages.map((m) =>
                m.from === "mama" ? (
                  <div key={m.id} className="flex animate-fade-in gap-3 motion-reduce:animate-none">
                    <MamaMark className="mt-0.5 size-8 shrink-0" />
                    <p className="min-w-0 pt-1 text-[15px] leading-relaxed text-foreground">{m.text}</p>
                  </div>
                ) : m.product ? (
                  <div
                    key={m.id}
                    className="animate-fade-in w-full max-w-sm self-end rounded-3xl border border-border/70 bg-background p-3 shadow-sm motion-reduce:animate-none"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-muted/60 p-1.5">
                        <WorkArt kind={m.product.art} className="h-full w-full" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {tWorks(`items.${m.product.nameKey}`)}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Star className="size-3.5 fill-brand-gold text-brand-gold" aria-hidden="true" />
                          {m.product.rating.toFixed(1)} · {tWorks("orders", { count: m.product.orders })}
                        </p>
                        <p className="mt-1 font-display text-base font-extrabold">
                          {fmt.format(m.product.priceUsd)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                      className="mt-2 flex items-center gap-1 text-xs font-bold text-primary underline-offset-4 hover:underline"
                    >
                      {expanded === m.id ? t("productHide") : t("productShow")}
                      <ChevronDown
                        className={cn("size-3.5 transition-transform", expanded === m.id && "rotate-180")}
                        aria-hidden="true"
                      />
                    </button>
                    {expanded === m.id && (
                      <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2 text-xs leading-relaxed text-muted-foreground">
                        <p>{t("productDetail1")}</p>
                        <p>{t("productDetail2")}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    key={m.id}
                    className="self-end animate-fade-in rounded-3xl bg-muted px-4 py-2.5 motion-reduce:animate-none"
                  >
                    <p className="max-w-[85%] text-[15px] leading-relaxed">{m.text}</p>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Quick topics + product search + composer */}
          <div className="mx-auto w-full max-w-2xl px-4 pb-4 sm:px-6">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => send(chip)}
                  className={cn(
                    "rounded-full border border-border/70 bg-background px-3 py-2 text-xs font-semibold text-foreground",
                    "transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>

            {pickerOpen && (
              <div className="mb-2 animate-fade-in rounded-[1.75rem] border border-border/80 bg-background p-3 shadow-md motion-reduce:animate-none">
                <div className="flex items-center gap-2">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    autoFocus
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("pickerSearch")}
                    aria-label={t("pickerSearch")}
                    className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    aria-label={t("pickerClose")}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-2 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                  {filteredPicker.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => addProduct(w)}
                      title={tWorks(`items.${w.nameKey}`)}
                      className="flex items-center gap-2 rounded-2xl border border-border/60 p-2 text-start transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted/60 p-1">
                        <WorkArt kind={w.art} className="h-full w-full" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold">
                          {tWorks(`items.${w.nameKey}`)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {fmt.format(w.priceUsd)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {filteredPicker.length === 0 && (
                    <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
                      {t("pickerEmpty")}
                    </p>
                  )}
                </div>
              </div>
            )}

            <form
              className="flex items-end gap-2 rounded-[1.75rem] border border-border/80 bg-background p-2.5 shadow-sm"
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
            >
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
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
                aria-label={t("attach")}
                title={t("attach")}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <Paperclip className="size-4.5" aria-hidden="true" />
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                placeholder={t("placeholder")}
                aria-label={t("placeholder")}
                className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-snug placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                aria-label={t("send")}
                title={t("send")}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <Send className="size-4.5 rtl:-scale-x-100" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>

        {/* Product rail — the free space becomes a work gallery */}
        {withProductRail && (
          <aside
            aria-label={t("railTitle")}
            className="min-h-0 shrink-0 overflow-y-auto border-t border-border/60 bg-background/40 p-4 lg:w-[340px] lg:border-s lg:border-t-0"
          >
            <p className="font-display text-sm font-bold">{t("railTitle")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("railHint")}</p>
            <WorkCategoryChips
              value={railCategory}
              onChange={setRailCategory}
              className="mt-3 [&>button]:h-9 [&>button]:px-3 [&>button]:text-xs"
            />
            <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
              {railWorks.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(WORK_DRAG_TYPE, w.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addProduct(w)}
                    title={tWorks(`items.${w.nameKey}`)}
                    className="group flex w-full items-center gap-2 rounded-3xl transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                  >
                    <WorkCard work={w} compact className="w-full transition-shadow group-hover:shadow-md" />
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground opacity-80 transition-opacity group-hover:opacity-100"
                    >
                      <Plus className="size-4" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageCircle className="size-3.5" aria-hidden="true" />
              {t("railFoot")}
            </p>
          </aside>
        )}
      </div>
    </section>
  );
}
