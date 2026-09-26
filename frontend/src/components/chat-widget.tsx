"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BunnyMark } from "@/components/illustrations/bunny-mark";
import { OPEN_CHAT_EVENT } from "@/components/open-chat-button";
import { cn } from "@/lib/utils";

/**
 * Floating chat widget — brand treatment (plan 11).
 *
 * The panel, mascot, opener and styling are the final brand surface; the
 * messaging itself (guest threads, SignalR) arrives with plan 06 and simply
 * replaces the disabled input.
 */
export function ChatWidget() {
  const t = useTranslations("Widget");
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const openWidget = useCallback(() => setOpen(true), []);
  const closeWidget = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onOpen = () => openWidget();
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, [openWidget]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWidget();
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (toggleRef.current?.contains(e.target as Node)) return;
      closeWidget();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, closeWidget]);

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={t("title")}
          className="fixed bottom-24 end-4 z-50 w-[min(22rem,calc(100vw-2rem))] animate-pop rounded-3xl border border-border/70 bg-popover p-4 text-popover-foreground shadow-xl sm:end-6"
        >
          {/* Panel header */}
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-cream">
              <BunnyMark className="size-8" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-bold">{t("title")}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-brand-sage" aria-hidden="true" />
                {t("comingSoon")}
              </p>
            </div>
            <button
              type="button"
              onClick={closeWidget}
              aria-label={t("ariaClose")}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {/* Opener */}
          <div className="mt-4 rounded-2xl rounded-ss-md bg-muted px-4 py-3 text-sm leading-relaxed">
            {t("opener")}
          </div>

          {/* Input (wired to guest threads with plan 06) */}
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              disabled
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              className="h-11 w-full rounded-full border border-input bg-background px-4 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
            />
            <span
              aria-hidden="true"
              title={t("send")}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-60"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4Z" />
              </svg>
            </span>
          </div>
        </div>
      )}

      {/* Toggle */}
      <button
        ref={toggleRef}
        type="button"
        data-testid="chat-toggle"
        onClick={() => (open ? closeWidget() : openWidget())}
        aria-expanded={open}
        aria-label={open ? t("ariaClose") : t("ariaOpen")}
        className={cn(
          "fixed bottom-4 end-4 z-50 flex size-14 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
        )}
      >
        {open ? (
          <X className="size-6" aria-hidden="true" />
        ) : (
          <BunnyMark className="size-9" />
        )}
      </button>
    </>
  );
}
