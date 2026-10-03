"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { api } from "@/lib/api/client";
import { type User } from "@/lib/auth";
import { consumeChatReturnTo } from "@/lib/chat/return-to";

function ChatScreen() {
  const t = useTranslations("Chat");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const threadParam = params.get("thread");
  const workParam = params.get("work");

  const [me, setMe] = useState<User | null | "loading">("loading");

  // Who am I? One API call decides guest vs user (the API is the only
  // source of truth for auth).
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
        withProductRail
        backLabel={t("back")}
        onBack={backToPreviousOrHome}
        onCloseThread={() => router.replace(pathname)}
        onOpenThread={(id) => {
          window.location.search = `?thread=${id}`;
        }}
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
