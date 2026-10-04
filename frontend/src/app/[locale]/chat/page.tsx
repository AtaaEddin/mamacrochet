"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { Identity } from "@/lib/api/generated-client";
import { isStaff, type User } from "@/lib/auth";
import * as chatApi from "@/lib/chat/api";
import { consumeChatReturnTo } from "@/lib/chat/return-to";

function ChatScreen() {
  const t = useTranslations("Chat");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const threadParam = params.get("thread");
  const workParam = params.get("work");

  const [me, setMe] = useState<User | null | "loading">("loading");
  const [notice, setNotice] = useState<string | null>(null);

  // Drop ?work= (keep ?thread= if present) so a refresh never re-sends the
  // work (sub-plan 04).
  const dropWork = () => {
    const q = new URLSearchParams();
    if (threadParam) q.set("thread", threadParam);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  // A failed action (e.g. New conversation) shows for 6 s, then clears.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Sub-plan 04: a logged-in CUSTOMER arriving at /chat?work=<id> with no
  // ?thread= (the product-page CTA) starts a FRESH conversation about that
  // work: create the thread, then open ?thread=<new>&work=<id> (the
  // initialProductId effect sends the work as its first message). Guests and
  // staff are untouched (guest = device thread, staff = no auto-create).
  const isCustomer = me !== null && me !== "loading" && !isStaff(me);
  const workCreatedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isCustomer || !workParam || threadParam) return;
    if (workCreatedForRef.current === workParam) return; // one-shot per work
    workCreatedForRef.current = workParam;
    let cancelled = false;
    void (async () => {
      const r = await chatApi.createThread({});
      if (cancelled) return;
      if (r.ok) {
        router.replace(`${pathname}?thread=${r.data.id}&work=${workParam}`);
      } else {
        setNotice(r.error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCustomer, workParam, threadParam, pathname, router]);

  // Who am I? One API call decides guest vs user (the API is the only
  // source of truth for auth).
  useEffect(() => {
    let cancelled = false;
    void Identity.me.get()
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

  if (me === "loading") {
    return (
      <main className="grid h-[100dvh] place-items-center">
        <span className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </main>
    );
  }

  const backToPreviousOrHome = () => {
    const back = consumeChatReturnTo();
    router.replace(back ?? "/");
  };

  if (me === null) {
    // Guest: the chat app screen with the visitor's own thread (D16).
    return (
      <main className="flex h-[100dvh] flex-col">
        <ChatPanel
          mode="guest"
          threadId={null}
          initialProductId={workParam}
          onInitialProductSent={dropWork}
          withProductRail
          backLabel={t("back")}
          onBack={backToPreviousOrHome}
        />
      </main>
    );
  }

  // User: threads in the left pane / mobile list, `?thread=` in the URL.
  return (
    <main className="flex h-[100dvh] flex-col">
      <ChatPanel
        mode="user"
        threadId={threadParam}
        initialProductId={workParam}
        onInitialProductSent={dropWork}
        withProductRail
        canOpenUnclaimed={!isStaff(me) || me.roles.includes("admin")}
        backLabel={t("back")}
        onBack={backToPreviousOrHome}
        onCloseThread={() => router.replace(pathname)}
        onOpenThread={(item) => {
          // Sub-plan 02: a non-admin staff member taking an unclaimed
          // conversation claims it first (first-wins); a lost race shows
          // the 409 message instead of a 403 deep in the thread.
          if (isStaff(me) && !me.roles.includes("admin") && !item.assigneeName) {
            void (async () => {
              const r = await chatApi.claimThread(item.id);
              if (r.ok) {
                router.replace(`${pathname}?thread=${item.id}`);
              } else {
                setNotice(r.error.message);
              }
            })();
            return;
          }
          router.replace(`${pathname}?thread=${item.id}`);
        }}
        onAutoOpenThread={(id) => router.replace(`${pathname}?thread=${id}`)}
        onNewConversation={
          isStaff(me)
            ? undefined
            : () => {
                // Sub-plan 02: a customer starts a free conversation with
                // themselves (the API ignores any body customerId).
                void (async () => {
                  const r = await chatApi.createThread({});
                  if (r.ok) {
                    setNotice(null);
                    router.replace(`${pathname}?thread=${r.data.id}`);
                  } else {
                    setNotice(r.error.message);
                  }
                })();
              }
        }
        notice={notice}
      />
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="grid h-[100dvh] place-items-center">
          <span className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        </main>
      }
    >
      <ChatScreen />
    </Suspense>
  );
}
