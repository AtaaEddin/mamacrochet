"use client";

import {
  HubConnectionBuilder,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/api/client";
import * as chat from "@/lib/chat/api";
import { getGuestId } from "@/lib/guest-id"; // plan-05 shared module (D14)

/**
 * The chat session (plan 06): one hook that owns a thread end-to-end.
 *
 * - guest mode: bootstraps the device's visitor thread (idempotent, D14)
 *   and authenticates the socket + REST with a short-lived thread token
 *   (D24); user mode: the mm.auth cookie does it all;
 * - realtime: a SignalR socket per thread with automatic reconnect;
 *   when the socket is down, a 5 s REST poll (`after=` cursor) carries the
 *   conversation — messages never stall on a flaky mobile network;
 * - sends: optimistic echo (clientId) → socket first, REST fallback,
 *   failed flag + retry; the server broadcast de-duplicates by clientId.
 */

export type ChatStatus =
  | "connecting"
  | "live"
  | "polling"
  | "closed"
  | "error";

export interface UiMessage extends chat.ChatMessage {
  pending: boolean;
  failed: boolean;
}

export interface SendInput {
  text: string;
  productId?: string | null;
  files: File[];
  /** Retry of a failed send keeps its original clientId (one row, no dupes). */
  clientId?: string;
}

const POLL_MS = 5_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

export const CHAT_FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";
export const CHAT_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

function toUiMessage(m: chat.ChatMessage): UiMessage {
  return { ...m, pending: false, failed: false };
}

function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseChatResult {
  status: ChatStatus;
  thread: chat.ChatThread | null;
  messages: UiMessage[];
  hasOlder: boolean;
  loadingHistory: boolean;
  /** The last server error message (rate limit, closed thread, …). */
  error: string | null;
  pendingFiles: File[];
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  /** Resolves `true` when the message was accepted by the server. */
  send: (input: SendInput) => Promise<boolean>;
  retry: (clientId: string) => void;
  loadOlder: () => Promise<void>;
  reconnect: () => void;
  clearError: () => void;
}

export function useChat(options: {
  mode: "guest" | "user";
  /** user mode: which thread is open (null = none). Guest mode: ignored. */
  threadId?: string | null;
  /** guest mode: called once the device thread id is known (URL sync). */
  onGuestThread?: (threadId: string) => void;
}): UseChatResult {
  const { mode, onGuestThread } = options;
  const openedThreadId = mode === "guest" ? null : (options.threadId ?? null);

  const [status, setStatus] = useState<ChatStatus>("connecting");
  const [thread, setThread] = useState<chat.ChatThread | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [runKey, setRunKey] = useState(0);

  const tokenRef = useRef<string | null>(null);
  const connRef = useRef<HubConnection | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesRef = useRef<UiMessage[]>([]);
  const visibleRef = useRef(true);
  const readAtRef = useRef(0);
  const onGuestThreadRef = useRef(onGuestThread);

  // Ref mirrors sync in effects (ref writes during render are disallowed).
  useEffect(() => {
    onGuestThreadRef.current = onGuestThread;
  }, [onGuestThread]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const auth = useCallback(
    (): chat.Auth => (tokenRef.current ? { token: tokenRef.current } : {}),
    [],
  );

  // ---- Guest bootstrap (idempotent per device) ------------------------------

  useEffect(() => {
    if (mode !== "guest" || openedThreadId !== null) return;
    let cancelled = false;
    (async () => {
      const result = await chat.bootstrapVisitorThread(getGuestId());
      if (cancelled) return;
      if (result.ok) {
        tokenRef.current = result.data.token;
        setThread(result.data.thread);
        onGuestThreadRef.current?.(result.data.thread.id);
        setStatus("connecting");
      } else {
        setStatus("error");
        setError(result.error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, openedThreadId, runKey]);

  // ---- Thread session (history + socket + fallback poll) --------------------

  const activeThreadId = mode === "guest" ? thread?.id ?? null : openedThreadId;

  // Reset the session when the thread (or a manual reconnect) changes —
  // the render-phase state adjustment React documents for prop changes.
  const [sessionKey, setSessionKey] = useState({
    id: activeThreadId ?? null,
    run: runKey,
  });
  if (sessionKey.id !== (activeThreadId ?? null) || sessionKey.run !== runKey) {
    setSessionKey({ id: activeThreadId ?? null, run: runKey });
    setStatus("connecting");
    setError(null);
    setMessages([]);
    setHasOlder(false);
  }

  useEffect(() => {
    if (!activeThreadId) return;
    let disposed = false;

    const lastConfirmedId = (): string | null => {
      const list = messagesRef.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        if (m && !m.pending) return m.id;
      }
      return null;
    };

    const upsert = (m: chat.ChatMessage) => {
      setMessages((prev) => {
        if (m.clientId) {
          const i = prev.findIndex((p) => p.clientId === m.clientId);
          if (i >= 0) {
            const copy = [...prev];
            copy[i] = toUiMessage(m);
            return copy;
          }
        }
        if (prev.some((p) => p.id === m.id)) return prev;
        return [...prev, toUiMessage(m)];
      });
    };

    const stopPolling = () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const startPolling = () => {
      if (pollRef.current !== null) return;
      pollRef.current = setInterval(async () => {
        const after = lastConfirmedId();
        const result = await chat.fetchThreadMessages(
          activeThreadId,
          auth(),
          { after: after ?? undefined, limit: 50 },
        );
        if (result.ok) {
          for (const m of result.data.messages) upsert(m);
          setHasOlder(result.data.hasOlder);
        }
      }, POLL_MS);
    };

    const maybeMarkRead = () => {
      if (mode !== "user" || !visibleRef.current) return;
      if (Date.now() - readAtRef.current < 4_000) return;
      readAtRef.current = Date.now();
      void chat.markThreadRead(activeThreadId);
    };

    // Initial thread + history (the newest page, ascending) — run beside the
    // socket so the first paint never waits on the websocket handshake.
    (async () => {
      const [threadResult, historyResult] = await Promise.all([
        chat.fetchThread(activeThreadId, auth()),
        chat.fetchThreadMessages(activeThreadId, auth()),
      ]);
      if (disposed) return;
      setLoadingHistory(false);
      if (threadResult.ok) {
        setThread(threadResult.data);
        // Never downgrade a status the socket already reported.
        setStatus((s) =>
          s === "connecting" ? (threadResult.data.isClosed ? "closed" : s) : s,
        );
      }
      if (historyResult.ok) {
        setMessages(historyResult.data.messages.map(toUiMessage));
        setHasOlder(historyResult.data.hasOlder);
      } else {
        setStatus((s) => (s === "live" ? s : "error"));
        setError(historyResult.error.message);
      }
    })();

    // The socket.
    const token = mode === "guest" ? tokenRef.current : null;
    const conn = new HubConnectionBuilder()
      .withUrl(
        `${API_BASE_URL}/hubs/chat${token ? `?access_token=${token}` : ""}`,
      )
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
      .configureLogging(LogLevel.Warning)
      .build();
    connRef.current = conn;

    conn.on("newMessage", (m: chat.ChatMessage) => {
      upsert(m);
      maybeMarkRead();
    });
    conn.on("threadUpdated", (t: chat.ChatThread) => {
      if (t.id === activeThreadId) {
        setThread(t);
        setStatus(t.isClosed ? "closed" : "live");
      }
    });
    conn.onclose(() => {
      if (!disposed) {
        startPolling();
        setStatus((s) => (s === "closed" ? s : "polling"));
      }
    });
    conn.onreconnected(() => {
      stopPolling();
      conn.invoke("JoinThread", activeThreadId).catch(() => {});
      setStatus((s) => (s === "closed" ? s : "live"));
      maybeMarkRead();
    });

    (async () => {
      try {
        await conn.start();
        if (disposed) return;
        await conn.invoke("JoinThread", activeThreadId);
        if (disposed) return;
        setStatus((s) => (s === "closed" ? s : "live"));
      } catch {
        if (disposed) return;
        startPolling();
        setStatus((s) => (s === "closed" ? s : "polling"));
      }
    })();

    // Page visibility — pause read-marking when hidden (the unread badge
    // is the point of going away and coming back).
    const onVisibility = () => {
      visibleRef.current = !document.hidden;
      if (visibleRef.current) maybeMarkRead();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      stopPolling();
      connRef.current = null;
      conn.stop().catch(() => {});
    };
  }, [activeThreadId, auth, mode, runKey]);

  // ---- Composer ---------------------------------------------------------------

  const addFiles = useCallback((files: File[]) => {
    setPendingFiles((prev) => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) return prev;
      const next = files.slice(0, room).filter(
        (f) =>
          CHAT_FILE_TYPES.has(f.type) &&
          f.size > 0 &&
          f.size <= MAX_FILE_BYTES,
      );
      return [...prev, ...next];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const upsertLocal = useCallback((clientId: string, m: chat.ChatMessage) => {
    setMessages((prev) => {
      const i = prev.findIndex((p) => p.clientId === clientId);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = toUiMessage(m);
        return copy;
      }
      return prev.some((p) => p.id === m.id) ? prev : [...prev, toUiMessage(m)];
    });
  }, []);

  const send = useCallback(
    async (input: SendInput) => {
      if (!activeThreadId) return false;
      const text = input.text.trim();
      if (text.length === 0 && input.files.length === 0 && !input.productId) return false;
      setError(null);

      // Uploads first — a failed upload never sends a half message.
      let attachments: chat.ChatAttachment[] = [];
      if (input.files.length > 0) {
        const upload = await chat.uploadThreadAttachments(
          activeThreadId,
          auth(),
          input.files,
        );
        if (!upload.ok) {
          setError(upload.error.message);
          return false;
        }
        attachments = upload.data;
      }

      const clientId = input.clientId ?? newClientId();
      const optimistic: UiMessage = {
        id: clientId,
        at: new Date().toISOString(),
        senderName: "",
        senderRole: mode === "guest" ? "guest" : "customer",
        body: text,
        productId: input.productId ?? null,
        productName: input.productId ?? null,
        deleted: false,
        attachments,
        clientId,
        pending: true,
        failed: false,
      };
      setMessages((prev) =>
        prev.some((p) => p.clientId === clientId)
          ? prev.map((p) => (p.clientId === clientId ? optimistic : p))
          : [...prev, optimistic],
      );

      // Socket first (the broadcast echo de-duplicates by clientId).
      const conn = connRef.current;
      let viaSocket = false;
      if (conn && conn.state === "Connected") {
        try {
          await conn.invoke(
            "SendMessage",
            activeThreadId,
            text,
            input.productId ?? null,
            attachments.map((a) => a.id),
            clientId,
          );
          viaSocket = true;
        } catch {
          viaSocket = false;
        }
      }

      if (!viaSocket) {
        const result = await chat.sendThreadMessage(
          activeThreadId,
          auth(),
          {
            body: text,
            productId: input.productId ?? null,
            attachmentIds: attachments.map((a) => a.id),
            clientId,
          },
        );
        if (result.ok) {
          upsertLocal(clientId, result.data);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === clientId ? { ...m, pending: false, failed: true } : m,
            ),
          );
          setError(result.error.message);
          return false;
        }
      } else {
        // The socket answered; drop the pending flag — the broadcast echo
        // (same clientId) replaces this row with the server copy.
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === clientId ? { ...m, pending: false } : m,
          ),
        );
      }

      setPendingFiles([]);
      return true;
    },
    [activeThreadId, auth, mode, upsertLocal],
  );

  const retry = useCallback(
    (failedClientId: string) => {
      const failed = messagesRef.current.find((m) => m.clientId === failedClientId);
      if (!failed) return;
      void send({
        text: failed.body,
        productId: failed.productId,
        files: [],
        clientId: failedClientId,
      });
    },
    [send],
  );

  const loadOlder = useCallback(async () => {
    if (!activeThreadId || !hasOlder || loadingHistory) return;
    const first = messagesRef.current.find((m) => !m.pending);
    if (!first) return;
    setLoadingHistory(true);
    const result = await chat.fetchThreadMessages(activeThreadId, auth(), {
      before: first.id,
      limit: 50,
    });
    setLoadingHistory(false);
    if (result.ok) {
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const older = result.data.messages.filter((m) => !known.has(m.id));
        return [...older.map(toUiMessage), ...prev];
      });
      setHasOlder(result.data.hasOlder);
    }
  }, [activeThreadId, auth, hasOlder, loadingHistory]);

  const reconnect = useCallback(() => {
    tokenRef.current = null; // guest: re-bootstrap a fresh token
    setThread(null);
    setRunKey((k) => k + 1);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    thread,
    messages,
    hasOlder,
    loadingHistory,
    error,
    pendingFiles,
    addFiles,
    removeFile,
    send,
    retry,
    loadOlder,
    reconnect,
    clearError,
  };
}
