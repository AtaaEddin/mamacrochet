"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { ChatExitBar } from "@/components/chat-exit-bar";
import { ChatPanel } from "@/components/chat-panel";
import { api } from "@/lib/api/client";
import { type User } from "@/lib/auth";
import { consumeChatReturnTo } from "@/lib/chat/return-to";
import * as chat from "@/lib/chat/api";

/**
 * /chat — the home of the platform (chat-first, brand v2).
 *
 * - Visitor: straight into Hanadi's chat — the device's visitor thread is
 *   bootstrapped silently by the panel (no account, no friction, D14).
 * - Signed-in customer: their conversations — one per order, plus the
 *   visitor thread once it is linked to their account. ?thread= opens a
 *   thread; without it, the list shows unread counts.
 *
 * The panel itself is one client component; this page only decides which
 * mode/thread it runs (kept tiny so the chat surface stays fast).
 */
function ChatScreen() {
  const t = useTranslations("Chat");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const threadParam = params.get("thread");
  const workParam = params.get("work");

  const [me, setMe] = useState<User | null | "loading">("loading");
  const [threads, setThreads] = useState<chat.ChatThreadListItem[] | null>(null);

  // Who is the visitor? (Anonymous → guest mode.)
  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/identity/me")
      .then((res) => {
        if (cancelled) return;
        setMe(!res.error && res.data ? res.data : null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The customer's thread list (live while the list screen is visible).
  const isUserList = me !== null && me !== "loading" && !threadParam;
  const loadThreads = useCallback(() => {
    void chat.fetchThreads().then((r) => {
      if (r.ok) setThreads(r.data.threads);
    });
  }, []);

  useEffect(() => {
    if (!isUserList) return;
    loadThreads();
    const timer = setInterval(loadThreads, 15_000);
    return () => clearInterval(timer);
  }, [isUserList, loadThreads]);

  const fmtTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return "";
    }
  };

  if (me === "loading") {
    return (
      <div className="grid h-[100dvh] place-items-center">
        <span className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // Back out of the chat to where the visitor came from (FAB/CTA recorded
  // it in sessionStorage); fresh tab / deep link → Home.
  const backToPreviousOrHome = () => {
    const back = consumeChatReturnTo();
    router.replace(back ?? "/");
  };

  // Visitor: the live chat, full height.
  if (me === null) {
    return (
      <div className="flex h-[100dvh] flex-col px-3 pb-3 pt-3 sm:px-4">
        <ChatExitBar backLabel={t("back")} onBack={backToPreviousOrHome} />
        <div className="min-h-0 flex-1">
          <ChatPanel mode="guest" initialProductId={workParam} withProductRail />
        </div>
      </div>
    );
  }

  // Signed-in customer, a thread open.
  if (threadParam) {
    return (
      <div className="flex h-[100dvh] flex-col px-3 pb-3 pt-3 sm:px-4">
        <ChatExitBar
          backLabel={t("allConversations")}
          onBack={() => {
            setThreads(null);
            router.replace(pathname);
          }}
        />
        <div className="min-h-0 flex-1 pt-2">
          <ChatPanel mode="user" threadId={threadParam} withProductRail />
        </div>
      </div>
    );
  }

  // Signed-in customer, list view.
  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col px-4 py-4">
      <ChatExitBar backLabel={t("back")} onBack={backToPreviousOrHome} />
      <p className="mt-2 font-display text-xl font-bold">{t("listTitle")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("listHint")}</p>
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4">
        {threads === null && (
          <span className="my-8 mx-auto size-7 animate-spin rounded-full border-2 border-border border-t-primary" />
        )}
        {threads !== null && threads.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <Inbox className="size-10 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("listEmpty")}</p>
          </div>
        )}
        {threads?.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => window.location.search = `?thread=${item.id}`}
            className="w-full rounded-3xl border border-border/70 bg-card p-4 text-start transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                {item.subject ?? t("noSubject")}
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
              <span className="mt-2 inline-grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {item.unread}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatPage() {
  // useSearchParams wants a Suspense boundary (Next 16, no CSR bailout).
  return (
    <Suspense
      fallback={
        <div className="grid h-[100dvh] place-items-center">
          <span className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      }
    >
      <ChatScreen />
    </Suspense>
  );
}
