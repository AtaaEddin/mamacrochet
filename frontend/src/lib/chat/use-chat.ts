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
 *   (D24); user mode: the hc.auth cookie does it all;
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
  /**
   * Retry of a failed send: its already-uploaded attachments (reused by id —
   * the files are on the server, no re-upload).
   */
  attachments?: chat.ChatAttachment[];
  /** Retry of a failed send keeps its original clientId (one row, no dupes). */
  clientId?: string;
}

const POLL_MS = 5_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

/**
 * Sub-plan 04: how long a guest send may WAIT for the bootstrap (thread
 * not yet created) before giving up with an error. The bootstrap POST has
 * no transport timeout, so on a wedged mobile network this is the guard
 * against pinning the composer in its in-flight state forever. The text
 * stays in the composer either way.
 */
const SEND_WAIT_TIMEOUT_MS = 30_000;
const WAIT_TIMEOUT_MESSAGE = "Still connecting to the chat — please try again.";

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
  /**
   * Guest "new conversation" (plan 20261003-2254 sub 02): re-bootstraps
   * the device thread with `reset: true` — the server closes the old one
   * (`guest_reset`, staff still see it) and opens a fresh one, capped at
   * 5 / 24 h per device. Guest mode only; on the 429 cap the old thread
   * is left untouched (the client keeps it and shows the error).
   */
  resetGuestThread: () => void;
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
  // One-shot "reset the guest thread" flag: set by resetGuestThread(),
  // consumed by the bootstrap effect on its next run.
  const resetRef = useRef(false);
  // Sub-plan 04: the current thread id without a stale closure — the send
  // pipeline reads it (it may have landed while a previous send awaited).
  const activeThreadIdRef = useRef<string | null>(null);
  // Sub-plan 04: one per bootstrap cycle (guest mode): resolved when the
  // thread id lands, rejected on bootstrap failure or a superseded cycle.
  // A send issued before the thread exists WAITS on it (never dropped).
  const readyRef = useRef<{
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason: Error) => void;
  } | null>(null);

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

  /**
   * One local upsert for every message path (send echo, socket broadcast,
   * poll fallback): replace the pending row by clientId, else append unless
   * the server row is already known.
   */
  const upsertMessage = useCallback((clientId: string, m: chat.ChatMessage) => {
    setMessages((prev) => {
      if (clientId) {
        const i = prev.findIndex((p) => p.clientId === clientId);
        if (i >= 0) {
          const copy = [...prev];
          copy[i] = toUiMessage(m);
          return copy;
        }
      }
      return prev.some((p) => p.id === m.id) ? prev : [...prev, toUiMessage(m)];
    });
  }, []);

  // ---- Guest bootstrap (idempotent per device) ------------------------------

  useEffect(() => {
    if (mode !== "guest" || openedThreadId !== null) return;
    let cancelled = false;
    (async () => {
      // The one-shot guest reset (sub 02): consumed even when it fails, so
      // a later plain bootstrap/reconnect is never a surprise reset.
      const doReset = resetRef.current;
      resetRef.current = false;
      const result = await chat.bootstrapVisitorThread(getGuestId(), doReset);
      if (cancelled) return;
      if (result.ok) {
        // Success: the new thread (and token) replace the old one — the
        // session switch below tears down the old thread's socket.
        tokenRef.current = result.data.token;
        setThread(result.data.thread);
        onGuestThreadRef.current?.(result.data.thread.id);
        setStatus("connecting");
      } else {
        // Failure. A plain bootstrap failure is a hard error (the retry
        // state). A reset failure means the server kept the old thread open
        // — the session effect already re-loaded it, so keep it live: just
        // the transient notice, no retry state over a working conversation.
        if (doReset) {
          setError(result.error.message);
        } else {
          setStatus("error");
          setError(result.error.message);
        }
        // Sub-plan 04: wake any send waiting on this cycle — the bootstrap
        // error is already shown; it keeps the text, retry recovers.
        // (A reset failure keeps the OLD thread, so sends don't wait here.)
        readyRef.current?.reject(new Error("bootstrap failed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, openedThreadId, runKey]);

  // ---- Thread-ready promise (sub-plan 04) ----------------------------------
  // One per bootstrap cycle (mount / reconnect / reset — all bump runKey).
  // The cleanup rejects the old one so a send waiting across a reconnect
  // fails fast instead of hanging.
  useEffect(() => {
    if (mode !== "guest") return;
    let resolve!: () => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // StrictMode double-mount rejects the first cycle before any send()
    // waits on it — keep that rejection from surfacing as unhandled.
    promise.catch(() => {});
    readyRef.current = { promise, resolve, reject };
    return () => reject(new Error("superseded"));
  }, [mode, runKey]);

  useEffect(() => {
    if (thread?.id) readyRef.current?.resolve();
  }, [thread?.id]);

  // ---- Thread session (history + socket + fallback poll) --------------------

  const activeThreadId = mode === "guest" ? thread?.id ?? null : openedThreadId;
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

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
          for (const m of result.data.messages) upsertMessage(m.clientId ?? "", m);
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
      upsertMessage(m.clientId ?? "", m);
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
  }, [activeThreadId, auth, mode, runKey, upsertMessage]);

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

  const send = useCallback(
    async (input: SendInput) => {
      const text = input.text.trim();
      if (text.length === 0 && input.files.length === 0 && !input.productId
        && !(input.attachments?.length ?? 0)) return false;

      // Sub-plan 04: never drop a send. Guest mode before the bootstrap
      // lands: WAIT for the thread (the composer shows its normal in-flight
      // state the whole time) instead of early-returning. User mode with no
      // thread open: the panel disables the composer, so this only guards.
      let threadId = activeThreadIdRef.current;
      if (!threadId && mode === "guest") {
        const ready = readyRef.current;
        if (!ready) return false;
        let timedOut = false;
        let timer: number | undefined;
        const timeout = new Promise<never>((_, rej) => {
          timer = window.setTimeout(() => {
            timedOut = true;
            rej(new Error("timeout"));
          }, SEND_WAIT_TIMEOUT_MS);
        });
        try {
          await Promise.race([ready.promise, timeout]);
        } catch {
          // Bootstrap failed (its error is already shown — don't
          // overwrite it) or the safety cap: keep the text, return false.
          if (timedOut) setError(WAIT_TIMEOUT_MESSAGE);
          return false;
        } finally {
          window.clearTimeout(timer);
        }
        threadId = activeThreadIdRef.current;
        if (!threadId) return false;
      }
      if (!threadId) return false;
      setError(null);

      // Uploads first — a failed upload never sends a half message. A retry
      // reuses the failed message's already-uploaded attachments (they are
      // on the server, keyed by id — no re-upload).
      let attachments: chat.ChatAttachment[] = [];
      if (input.files.length > 0) {
        const upload = await chat.uploadThreadAttachments(
          threadId,
          auth(),
          input.files,
        );
        if (!upload.ok) {
          setError(upload.error.message);
          return false;
        }
        attachments = upload.data;
        // Per-send consumption (sub-plan 04): only THIS send's files are
        // consumed. A chip attached mid-flight survives the completion of
        // an earlier send; once uploaded, the files live on the server
        // keyed by id — a later send failure reuses them, never the chips.
        setPendingFiles((prev) => prev.filter((f) => !input.files.includes(f)));
      } else if (input.attachments) {
        attachments = input.attachments;
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
            threadId,
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
          threadId,
          auth(),
          {
            body: text,
            productId: input.productId ?? null,
            attachmentIds: attachments.map((a) => a.id),
            clientId,
          },
        );
        if (result.ok) {
          upsertMessage(clientId, result.data);
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

      // No blanket setPendingFiles([]) here: chips are removed only when
      // THIS send's upload succeeds (see above).
      return true;
    },
    [auth, mode, upsertMessage],
  );

  const retry = useCallback(
    (failedClientId: string) => {
      const failed = messagesRef.current.find((m) => m.clientId === failedClientId);
      if (!failed) return;
      void send({
        text: failed.body,
        productId: failed.productId,
        files: [],
        attachments: failed.attachments,
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

  const resetGuestThread = useCallback(() => {
    if (mode !== "guest") return;
    // Re-run the bootstrap effect (runKey) with the one-shot reset flag;
    // the thread/token are swapped only on success, so a capped (429)
    // reset leaves the old conversation untouched and the error shows.
    resetRef.current = true;
    setRunKey((k) => k + 1);
  }, [mode]);

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
    resetGuestThread,
    clearError,
  };
}
