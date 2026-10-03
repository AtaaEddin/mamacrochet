# 04 — Chat send races: per-send file clearing + no drop before the thread exists

status: proposed

Frontend only: `lib/chat/api.ts`, `lib/chat/use-chat.ts`,
`components/chat-panel.tsx`. Source: API-client plan, notes items 4 + 5.

## Bugs (verified 2026-10-03)

- **Race A — mid-flight file vanishes.** `send()` ends with an unconditional
  `setPendingFiles([])`. A file attached while a previous send is in flight
  (attachment upload + socket/REST invoke take well over a second on mobile)
  is wiped when the first send completes: chip gone, nothing uploaded, no
  error.
- **Race B — pre-bootstrap guest send dropped.** `send()` early-returns when
  `activeThreadId` is null; in guest mode that is the whole window before
  `POST /chat/visitor` resolves. The composer is enabled during "connecting",
  so typed text + Enter is lost silently. Same silent-drop class in user
  mode: on desktop the composer is visible with **no thread open**
  (`listStep` only hides it on mobile) — Enter does nothing.
- **Double bootstrap.** `ChatPanel` mounts once today, but dev StrictMode
  double-fires the guest bootstrap effect → two `POST /chat/visitor` per
  mount. D16's guest bucket is 5/min shared per IP (API-client plan
  test-harness notes) — a double mount doubles the burn, and it would again
  the moment a second panel is ever mounted.

## Decision (main.md)

- **Wait, don't drop.** A guest send issued before the thread exists awaits
  the thread (a promise resolved when the bootstrap lands; 30 s safety
  timeout → error, text kept) — no queue, no forgotten message, and the
  composer shows its normal in-flight state the whole time.
- **Chips are consumed per send.** Only the `File[]` of the send whose
  **upload succeeded** are removed (after upload the files live on the
  server keyed by attachment id — a failed/retried message reuses the ids,
  not the `File` objects). Upload failure keeps the chips (resendable).
- **Bootstrap is deduped per `guestId` while in flight** (module-level memo)
  → any double mount costs exactly one D16 bucket hit.
- **Desktop user-mode composer without a thread: disabled** (the "pick a
  conversation" empty state already explains why) — no new "send anywhere"
  behavior.

## Fix

### `lib/chat/api.ts` — bootstrap in-flight dedupe

```ts
const bootstrapInflight =
  new Map<string, Promise<ChatResult<VisitorThreadCreated>>>();

export function bootstrapVisitorThread(guestId: string, reset = false) {
  const existing = bootstrapInflight.get(guestId);
  if (existing) return existing;
  const p = call<VisitorThreadCreated>(() =>
    Chat.bootstrapVisitorThread({
      body: { guestId, name: null, website: null, reset },
    }),
  ).finally(() => bootstrapInflight.delete(guestId));
  bootstrapInflight.set(guestId, p);
  return p;
}
```

Two concurrent mounts share one POST; a *later* call (reconnect, after
settle) still hits the API — a fresh token is needed then, so only in-flight
calls are shared.

### `lib/chat/use-chat.ts`

- **Race A.** In `send()`: right after `upload.ok`, remove only this send's
  files — `setPendingFiles(prev => prev.filter(f => !input.files.includes(f)))`
  (reference equality: the panel passes the same `File` objects it chipped).
  Delete the trailing `setPendingFiles([])`. Failure paths already return
  early; upload-failed keeps its chips, upload-OK-and-message-failed has
  already removed them (the server keeps the files, the failed row + retry
  reference them by id).
- **Race B.**
  - Add `activeThreadIdRef` (ref mirror, same pattern as `messagesRef`) so
    the pipeline reads the *current* thread id even from a stale closure.
  - A per-bootstrap-cycle ready promise (guest mode):
    ```ts
    const readyRef = useRef<{ promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } | null>(null);

    useEffect(() => {                       // new cycle per mount / reconnect
      if (mode !== "guest") return;
      let resolve!: () => void, reject!: (e: Error) => void;
      const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
      readyRef.current = { promise, resolve, reject };
      return () => reject(new Error("superseded"));
    }, [mode, runKey]);

    useEffect(() => {
      if (thread?.id) readyRef.current?.resolve();
    }, [thread?.id]);
    ```
    The bootstrap effect's failure branch (`setStatus("error")`) also calls
    `readyRef.current?.reject(…)`.
  - `send()` head becomes:
    ```ts
    let threadId = activeThreadIdRef.current;
    if (!threadId && mode === "guest") {
      const ready = readyRef.current;                 // exists once the cycle effect ran
      if (!ready) return false;
      let timer: number | undefined;
      const timedOut = new Promise<never>((_, rej) => {
        timer = window.setTimeout(() => rej(new Error("timeout")), 30_000);
      });
      try {
        await Promise.race([ready.promise, timedOut]);
      } catch {
        setError(WAIT_TIMEOUT_MESSAGE);             // see below
        return false;
      } finally {
        window.clearTimeout(timer);
      }
      threadId = activeThreadIdRef.current;
      if (!threadId) return false;                   // bootstrap failed meanwhile
    }
    if (!threadId) return false;                     // user mode, no thread open
    ```
    The rest of the pipeline uses the local `threadId` (replacing the
    `activeThreadId` reads); the wait happens while the panel's `sending`
    flag is set, so the composer is in its normal in-flight state — the text
    stays in the textarea until the send actually lands.
  - The 30 s cap: the guest bootstrap POST has no transport timeout, so on a
    wedged mobile network the send must not pin the composer forever. The
    bootstrap itself keeps its own lifecycle (error state + retry button).
  - The wait-timeout message is a plain module constant in the hook
    (`WAIT_TIMEOUT_MESSAGE`), English — consistent with how this panel
    surfaces every other error today (raw server strings / the localized
    `ApiError` map; a new localized key is out of scope).
  - `send`'s `useCallback` deps drop `activeThreadId` (the ref read is
    stable); `mode`, `auth`, `upsertMessage` stay.
- Ready-promise lifecycle notes (from the current code):
  - The ready cycle is created in an effect keyed `[mode, runKey]` (guest
    only), matching the bootstrap effect's cycle; its cleanup rejects the
    old promise so a waiting send across a reconnect/new-conversation
    (both bump `runKey`) fails instead of hanging.
  - The bootstrap effect's failure branch (`setStatus("error")`) also calls
    `readyRef.current?.reject(…)` — a send waiting on a failed bootstrap
    returns `false` with the bootstrap error already shown (the panel
    keeps the text; the top-bar retry button stays the recovery path).
  - `resetGuestThread` (new conversation) also bumps `runKey`: the old
    thread id is still set, so the fresh ready promise resolves
    immediately — a send during a reset races the server-side close of the
    old thread and fails as a normal closed-thread error (accepted edge
    case; no special handling).

### `components/chat-panel.tsx`

- User mode, no thread open (desktop): `const noThread = mode === "user" &&
  !threadId;` → `disabled={… || noThread}` on the textarea and the Send
  button, the paperclip + product-search buttons, and the quick chips; the
  drag-and-drop handler's `sendText` is guarded by `!noThread`. The thread
  area already shows the "pick a conversation" empty state.
- Nothing else needed for the wait path: `sending` is set for the whole
  await, `ok === false` keeps the text, `ok === true` clears it (existing).

No new i18n keys (see the constant note above).

## Definition of done

- `pnpm typecheck` · `pnpm lint` green.
- Browser-verified (Playwright, real stack; light + dark; en + ar; mobile +
  desktop):
  1. **Pre-bootstrap send:** Playwright delays `POST /chat/visitor` ~1.5 s;
     a fresh guest types a message and hits Enter within the window → the
     message appears (DB row in the visitor thread), no error, text not
     duplicated.
  2. **Mid-flight file:** attach image A + send; while the upload is
     delayed (~1 s) attach image B → after completion A's chip is gone,
     **B's chip is still there**; a second send delivers only B; DB shows
     one attachment per message.
  3. **Double mount:** fresh guest on `/chat` (dev StrictMode) → exactly
     one `POST /chat/visitor` (request count in the Playwright script).
  4. **User mode, no thread (desktop):** composer controls disabled; Enter /
     chips / drop produce nothing (no network send, no message row).
  5. **Bootstrap failure:** abort `POST /chat/visitor` → error state +
     retry (existing); a send attempted meanwhile shows the wait-error,
     text kept; after retry + reconnect the same text sends fine.
  6. Upload failure (oversize file rejected) keeps the chip; send failure
     (closed thread / rate limit) shows the failed row with retry (existing
     behavior unchanged).
