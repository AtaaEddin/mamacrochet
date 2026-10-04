import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChatAttachmentDto,
  ChatMessageDto,
  ThreadDto,
} from "@/lib/api/generated-client";
import * as chat from "./api";
import { useChat } from "./use-chat";

const mockedChat = vi.mocked(chat);

/** One fake socket per hook render, controlled from the test. */
interface FakeHub {
  state: string;
  url: string;
  /** Reject `start()` (socket never connects → polling fallback). */
  startFails: boolean;
  /** Reject every `invoke` (the REST fallback must kick in). */
  invokeFails: boolean;
  invokeLog: Array<{ method: string; args: unknown[] }>;
  emit: (event: string, ...args: unknown[]) => void;
  /** Simulate the server closing the socket. */
  triggerClose: (err?: unknown) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
}

const ctrl = vi.hoisted(() => {
  const connections: FakeHub[] = [];
  const flags = { startFails: false };
  class FakeHubImpl implements FakeHub {
    state = "Disconnected";
    url: string;
    startFails = false;
    invokeFails = false;
    invokeLog: Array<{ method: string; args: unknown[] }> = [];
    private handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    private closeHandlers: Array<(err: unknown) => void> = [];
    constructor(url: string) {
      this.url = url;
    }
    on(event: string, cb: (...args: unknown[]) => void): void {
      const list = this.handlers.get(event) ?? [];
      list.push(cb);
      this.handlers.set(event, list);
    }
    private reconnectedCbs: Array<(conn: unknown) => void> = [];
    onclose(cb: (err: unknown) => void): void {
      this.closeHandlers.push(cb);
    }
    onreconnected(cb: (conn: unknown) => void): void {
      this.reconnectedCbs.push(cb);
    }
    triggerClose(err?: unknown): void {
      this.state = "Disconnected";
      for (const cb of this.closeHandlers) cb(err);
    }
    emit(event: string, ...args: unknown[]): void {
      for (const cb of this.handlers.get(event) ?? []) cb(...args);
    }
    async start(): Promise<void> {
      if (this.startFails) {
        this.state = "Disconnected";
        throw new Error("websocket failed");
      }
      this.state = "Connected";
    }
    async stop(): Promise<void> {
      this.state = "Disconnected";
    }
    async invoke(method: string, ...args: unknown[]): Promise<unknown> {
      this.invokeLog.push({ method, args });
      if (this.invokeFails) throw new Error("invoke failed");
      return undefined;
    }
  }
  class HubConnectionBuilder {
    private url = "";
    withUrl(url: string): this {
      this.url = url;
      return this;
    }
    private reconnectDelays: number[] = [];
    private logLevel: unknown = null;
    withAutomaticReconnect(delays: number[]): this {
      this.reconnectDelays = delays;
      return this;
    }
    configureLogging(level: unknown): this {
      this.logLevel = level;
      return this;
    }
    build(): FakeHub {
      const conn = new FakeHubImpl(this.url);
      conn.startFails = flags.startFails;
      connections.push(conn);
      return conn;
    }
  }
  const LogLevel = { Warning: 3 } as const;
  return { connections, flags, HubConnectionBuilder, LogLevel };
});

vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: ctrl.HubConnectionBuilder,
  LogLevel: ctrl.LogLevel,
}));

vi.mock("@/lib/chat/api", () => ({
  ALLOWED_FILE_TYPES: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
  ],
  bootstrapVisitorThread: vi.fn(),
  createThread: vi.fn(),
  deleteThread: vi.fn(),
  fetchThread: vi.fn(),
  fetchThreadMessages: vi.fn(),
  fetchThreads: vi.fn(),
  markThreadRead: vi.fn(),
  searchStaffCustomers: vi.fn(),
  sendThreadMessage: vi.fn(),
  uploadThreadAttachments: vi.fn(),
}));

vi.mock("@/lib/guest-id", () => ({
  getGuestId: () => "guest-fixed",
}));

// ---- fixtures ---------------------------------------------------------------

function thread(overrides: Partial<ThreadDto> = {}): ThreadDto {
  return {
    id: "thread-1",
    kind: "order",
    subject: null,
    isClosed: false,
    closedReason: null,
    createdAt: "2026-01-01T00:00:00Z",
    lastMessageAt: null,
    order: null,
    participants: [],
    ...overrides,
  };
}

function message(
  id: string,
  overrides: Partial<ChatMessageDto> = {},
): ChatMessageDto {
  return {
    id,
    at: "2026-01-01T00:00:00Z",
    senderName: "Customer",
    senderRole: "customer",
    body: `body ${id}`,
    productId: null,
    productName: null,
    deleted: false,
    attachments: [],
    clientId: null,
    ...overrides,
  };
}

function attachment(id: string): ChatAttachmentDto {
  return {
    id,
    url: `/files/chat/thread-1/${id}.webp`,
    contentType: "image/webp",
    originalName: "a.webp",
    bytes: "100",
  };
}

function file(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

function renderSession(
  options: {
    mode: "guest" | "user";
    threadId?: string | null;
    onGuestThread?: (threadId: string) => void;
  } = { mode: "user", threadId: "thread-1" },
) {
  return renderHook(() => useChat(options));
}


// ---- tests --------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  ctrl.connections.length = 0;
  ctrl.flags.startFails = false;

  mockedChat.fetchThread.mockResolvedValue({
    ok: true,
    data: thread(),
  });
  mockedChat.fetchThreadMessages.mockResolvedValue({
    ok: true,
    data: { messages: [message("m1"), message("m2")], hasOlder: false, hasNewer: false },
  });
  mockedChat.sendThreadMessage.mockImplementation(
    async (_threadId: string, _auth: object, body: { body: string; clientId: string }) => ({
      ok: true,
      data: message(`srv-${body.clientId}`, {
        body: body.body,
        clientId: body.clientId,
      }),
    }),
  );
  mockedChat.uploadThreadAttachments.mockResolvedValue({
    ok: true,
    data: [attachment("att-1")],
  });
  mockedChat.markThreadRead.mockResolvedValue(true);
  mockedChat.bootstrapVisitorThread.mockResolvedValue({
    ok: true,
    data: { thread: thread({ id: "guest-thread" }), token: "guest-token" },
  });
});

const hub = (): FakeHub => {
  const conn = ctrl.connections.at(-1);
  if (!conn) throw new Error("no hub built yet");
  return conn;
};

describe("useChat — user mode", () => {
  it("loads history and goes live on socket start", async () => {
    const { result } = renderSession();

    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.thread?.id).toBe("thread-1");
    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: "m1", pending: false }),
      expect.objectContaining({ id: "m2", pending: false }),
    ]);
    expect(hub().url).toContain("/hubs/chat");
    expect(hub().url).not.toContain("access_token");
  });

  it("send: optimistic echo, socket first, broadcast replaces (no dupe)", async () => {
    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("live"));

    const sendPromise = result.current.send({
      text: "hello",
      files: [],
      productId: null,
    });
    await waitFor(() => expect(sendPromise).resolves.toBe(true));

    // The server broadcast (same clientId) replaces the echoed row.
    const clientId = result.current.messages.at(-1)?.clientId ?? "c1";
    hub().emit("newMessage", message("srv-1", {
      body: "hello",
      clientId,
    }));

    await waitFor(() =>
      expect(result.current.messages.some((m) => m.id === "srv-1")).toBe(true),
    );
    const all = result.current.messages;
    expect(all.filter((m) => m.clientId === (clientId || "c1"))).toHaveLength(1);
    expect(all.at(-1)).toMatchObject({ id: "srv-1", pending: false, failed: false });
  });

  it("socket down → polling status + send falls back to REST", async () => {
    ctrl.flags.startFails = true;
    const { result } = renderSession();

    await waitFor(() => expect(result.current.status).toBe("polling"));
    expect(hub().state).toBe("Disconnected");

    const sendPromise = result.current.send({
      text: "hello",
      files: [],
      productId: null,
    });
    await expect(sendPromise).resolves.toBe(true);
    expect(mockedChat.sendThreadMessage).toHaveBeenCalledTimes(1);
    expect(mockedChat.sendThreadMessage.mock.calls[0]?.[0]).toBe("thread-1");
    const last = result.current.messages.at(-1);
    expect(last).toMatchObject({ pending: false, failed: false });
  });

  it("REST failure flags the message as failed and shows the error", async () => {
    mockedChat.sendThreadMessage.mockResolvedValueOnce({
      ok: false,
      error: { code: "server_error", message: "Boom" },
    });
    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("live"));
    hub().state = "Disconnected"; // force the REST path

    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.send({
        text: "hello",
        files: [],
        productId: null,
      });
    });
    expect(sent).toBe(false);

    const last = result.current.messages.at(-1);
    expect(last).toMatchObject({ pending: false, failed: true, body: "hello" });
    expect(result.current.error).toBe("Boom");
  });

  it("files: chips are consumed only when THIS send's upload succeeds", async () => {
    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("live"));

    const f1 = file("a.webp", "image/webp");
    const f2 = file("b.webp", "image/webp");
    await act(async () => {
      result.current.addFiles([f1, f2, file("big.bin", "application/octet-stream")]);
    });
    expect(result.current.pendingFiles).toHaveLength(2); // wrong type dropped

    // Failure: the chips survive (retry-able).
    mockedChat.uploadThreadAttachments.mockResolvedValueOnce({
      ok: false,
      error: { code: "file_too_big", message: "Too big" },
    });
    let failSent: boolean | undefined;
    await act(async () => {
      failSent = await result.current.send({
        text: "with file",
        files: [result.current.pendingFiles[0]!],
        productId: null,
      });
    });
    expect(failSent).toBe(false);
    expect(result.current.error).toBe("Too big");
    expect(result.current.pendingFiles).toHaveLength(2);

    // Success: only THIS send's file is consumed.
    let okSent: boolean | undefined;
    await act(async () => {
      okSent = await result.current.send({
        text: "with file again",
        files: [result.current.pendingFiles[0]!],
        productId: null,
      });
    });
    expect(okSent).toBe(true);
    expect(result.current.pendingFiles).toHaveLength(1);
    // Socket send answered: pending clears; the broadcast echo (same
    // clientId) is what finally replaces the row with the server copy.
    expect(result.current.messages.at(-1)).toMatchObject({
      pending: false,
      body: "with file again",
    });
    expect(result.current.messages.at(-1)?.attachments ?? []).toHaveLength(1);
  });

  it("socket close → polling fallback; threadUpdated(closed) → closed", async () => {
    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("live"));

    // A dropped socket is NOT a closed thread: fall back to polling.
    hub().triggerClose(new Error("dropped"));
    await waitFor(() => expect(result.current.status).toBe("polling"));
    expect(result.current.thread).toMatchObject({ isClosed: false });

    // The server's close announcement flips to closed.
    hub().emit(
      "threadUpdated",
      thread({ id: "thread-1", isClosed: true, closedReason: "closed by admin" }),
    );
    await waitFor(() => expect(result.current.status).toBe("closed"));
    expect(result.current.thread).toMatchObject({
      isClosed: true,
      closedReason: "closed by admin",
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("loadOlder prepends the older page without duplicating rows", async () => {
    mockedChat.fetchThreadMessages
      .mockResolvedValueOnce({
        ok: true,
        data: {
          messages: [message("m1"), message("m2")],
          hasOlder: true,
          hasNewer: false,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          // m2 repeats (overlap) — m0 is the new older row.
          messages: [message("m0"), message("m2")],
          hasOlder: false,
          hasNewer: false,
        },
      });

    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("live"));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(result.current.messages.map((m) => m.id)).toEqual([
      "m0",
      "m1",
      "m2",
    ]);
    expect(result.current.hasOlder).toBe(false);
  });
});

describe("useChat — guest mode", () => {
  // The session's fetchThread overwrites the bootstrapped thread — keep it
  // consistent with what the bootstrap mock hands out.
  beforeEach(() => {
    mockedChat.fetchThread.mockResolvedValue({
      ok: true,
      data: thread({ id: "guest-thread" }),
    });
  });

  it("send before the bootstrap lands WAITS, then proceeds (never dropped)", async () => {
    let releaseBootstrap: () => void = () => {};
    const gate = new Promise<void>((res) => {
      releaseBootstrap = () => res();
    });
    mockedChat.bootstrapVisitorThread.mockImplementationOnce(async () => {
      await gate;
      return {
        ok: true,
        data: { thread: thread({ id: "guest-thread" }), token: "guest-token" },
      };
    });

    const { result } = renderSession({ mode: "guest" });

    // Issued while the bootstrap is still in flight.
    const sendPromise = result.current.send({
      text: "hi there",
      files: [],
      productId: null,
    });
    let sent: boolean | undefined;
    void sendPromise
      .then((v) => {
        sent = v;
      })
      .catch(() => undefined);

    // Gated on the bootstrap: nothing can have been sent yet.
    await waitFor(() =>
      expect(mockedChat.bootstrapVisitorThread).toHaveBeenCalledTimes(1),
    );
    expect(mockedChat.sendThreadMessage).not.toHaveBeenCalled();

    releaseBootstrap();

    // The send resolves only AFTER the bootstrap landed (never dropped).
    await waitFor(() => expect(sent).toBe(true));
    // The socket was live → the send went through it, addressed to the
    // bootstrapped thread.
    const invokes = hub().invokeLog.filter((i) => i.method === "SendMessage");
    expect(invokes).toHaveLength(1);
    expect(invokes[0]?.args[0]).toBe("guest-thread");
    expect(invokes[0]?.args[1]).toBe("hi there");
  });

  it("bootstrap failure → error status with the server message", async () => {
    mockedChat.bootstrapVisitorThread.mockResolvedValueOnce({
      ok: false,
      error: { code: "server_error", message: "Capped" },
    });
    const { result } = renderSession({ mode: "guest" });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Capped");
  });

  it("a send waiting on a failed bootstrap keeps the text (returns false)", async () => {
    let releaseBootstrap: () => void = () => {};
    const gate = new Promise<void>((res) => {
      releaseBootstrap = () => res();
    });
    mockedChat.bootstrapVisitorThread.mockImplementationOnce(async () => {
      await gate;
      return {
        ok: false,
        error: { code: "server_error", message: "Capped" },
      };
    });

    const { result } = renderSession({ mode: "guest" });
    const sendPromise = result.current.send({
      text: "stuck",
      files: [],
      productId: null,
    });
    let sent: boolean | undefined;
    void sendPromise
      .then((v) => {
        sent = v;
      })
      .catch(() => undefined);

    releaseBootstrap();

    await waitFor(() => expect(sent).toBe(false));
    expect(mockedChat.sendThreadMessage).not.toHaveBeenCalled();
  });
});
