# Chat attachment/access/send fixes + hiring dialog overflow

status: done
created: 2026-10-03 23:37 (+03)
owner: agent (requested by owner 2026-10-03)

## Source

`20261003-1303_generated-api-client` (done) ended its browser verification with
"Pre-existing product issues found (OUT of scope — candidates for separate plans;
none were fixed here)" — 5 numbered items. Owner: turn them into a plan. This plan
fixes all of them; each item was re-verified in code on 2026-10-03 (below).

| # | Issue (from the notes) | Sub-plan |
|---|---|---|
| 1 | Chat attachment images 404 — missing `fileSrc()` | `01-chat-attachment-urls.md` |
| 2 | Staff chat auto-open 403 on unclaimed visitor threads | `02-staff-unclaimed-thread-access.md` |
| 3 | Hiring detail dialog overflows at short viewports | `03-hiring-dialog-overflow.md` |
| 4 | `use-chat` `send()` clears `pendingFiles` unconditionally (mid-flight file vanishes) | `04-chat-send-races.md` |
| 5 | Guest send before bootstrap completes is dropped silently (+ bootstrap double-fire on double mount) | `04-chat-send-races.md` |

## Today (verified in code 2026-10-03)

1. **Attachments.** `ChatService.cs:1328` builds `Url =
   /files/chat/{tid}/{name}?sig=..&exp=..` — relative + signed. `chat-panel.tsx` →
   `Attachments` renders `a.url` raw (`<img src={a.url}>`, PDF `href={a.url}`,
   lightbox `url: a.url`) → the browser resolves against the web origin (:3000 dev /
   Caddy web prod), which has no `/files` route → 404. Every other file surface
   (products, avatars, hiring files, receipts) already goes through `fileSrc()`
   (`lib/api/client.ts:285`) resolving against `API_BASE_URL`.
2. **Staff 403.** `ListThreadsAsync`'s employee branch returns assigned threads
   **plus** unclaimed visitor threads — a documented design
   (`20260926-1816_mvp-platform-foundation/06-chat.md`: "the same query feeds both
   /chat and the staff inbox. Claim is first-wins (claim endpoint enforces; the
   list only offers it while unassigned)"). But `CheckAccessAsync`
   (`ChatService.cs:59`) grants a non-admin employee a thread only when they are
   the assignee (or customer/linked-guest). Three paths 403 on an unclaimed
   visitor thread: `/chat` auto-open (chat-panel sub-03 effect picks the newest
   open thread), list click in `/chat`, and "Open" in the Visitors inbox
   (`staff-visitors-view.tsx` → `/chat?thread=`). Bonus gap:
   `ClaimThreadAsync` does a plain assign + save (last write wins) although the
   plan doc says the claim endpoint enforces first-wins.
3. **Hiring dialog.** `DetailDialog` (`hiring-dialogs.tsx`) renders an unbounded
   content grid (contact + previous work + message + files + history + footer) in
   a `max-w-2xl` `DialogContent` with no height cap → at viewport heights ≲ 1000px
   the Accept/Decline footer is below the fold and unreachable.
4. **Send race A.** `use-chat.ts` `send()` ends with unconditional
   `setPendingFiles([])` — a file attached while a previous send is in flight
   (upload + socket invoke) vanishes on completion; nothing uploaded, no error.
5. **Send race B + double bootstrap.** `send()` early-returns when
   `activeThreadId` is null; the composer is enabled during guest "connecting", so
   typed text is lost without feedback. In user mode the desktop composer is
   likewise enabled with no thread open (mobile hides it via the list step).
   Separate from that: `ChatPanel` mounts once, but dev StrictMode double-fires
   the guest bootstrap effect → two `POST /chat/visitor` per mount — the D16
   guest bucket is 5/min shared per IP (see the API-client plan's test-harness
   notes), so a double mount doubles the burn.

## Decisions (recorded with sources)

- **02 — opening a visitor thread is how staff take it (claim-on-open);
  auto-open never grabs work.** An explicit open (Visitors-inbox "Open" or a
  list click) of an *unclaimed visitor* thread by a non-admin employee first
  calls `chat.claimThread`, then navigates — "first-wins" is the documented
  claim model (in-repo source: `06-chat.md`, D14) and the opener taking the
  conversation is the natural moment to claim. Auto-open (landing in the newest
  conversation) **skips** unclaimed threads for plain employees — arriving at
  `/chat` must not assign a stranger's guest thread — while admins keep
  auto-opening anything (full access) and customers are unaffected (their lists
  only contain their own/linked threads). The thread list itself is unchanged
  (the one-query design stays). `ClaimThreadAsync` gains a conditional
  update (claim only while `AssignedEmployeeId == null`) so first-wins is
  actually enforced and the loser gets a clean 409 `conflict` instead of a
  403-on-open — closing the gap between the doc's "claim endpoint enforces"
  and the code. No schema change (no migration).
- **03 — cap the dialog, scroll the body, pin header + footer.** Baseline is
  shadcn/ui's official dialog recipe "Scrollable Content"
  (`<DialogContent className="max-h-[80vh] overflow-y-auto">`) —
  https://ui.shadcn.com/docs/components/base/dialog (retrieved 2026-10-03). We
  keep the header and the Accept/Decline footer pinned (the buttons are the
  point of the dialog) by making the content section the scroll region.
  Mobile-first: `80dvh` leaves room for the URL bar; light/dark + ar (RTL)
  verified.
- **04 — never drop a send: await the thread instead of early-returning.**
  A guest send issued before `POST /chat/visitor` resolves *waits* for the
  thread (promise resolved when the bootstrap lands; 30 s safety timeout →
  error, text kept in the composer) — no message is queued-and-forgotten, and
  the composer shows the normal in-flight state the whole time. File chips are
  cleared **per send**: only the `File[]` actually consumed by a successful
  upload are removed (after upload the files live on the server, keyed by
  attachment id — retry reuses ids, not `File` objects), so a chip added
  mid-flight survives. Bootstrap calls are deduped per `guestId` while in
  flight (module-level memo in `lib/chat/api.ts`) so a double mount (StrictMode
  dev, any future double panel) costs exactly one D16 bucket hit. The desktop
  user-mode composer without an open thread is disabled (same silent-drop
  class) — no new "send anywhere" behavior.

## Out of scope

- Any other chat feature (thread delete, new-conversation flows, product CTA —
  those live in `20261003-2254` and are done).
- The double-claim *broadcast* semantics beyond first-wins enforcement,
  per-thread row versioning, or claim audit events.
- A frontend test harness (the repo verifies in a browser — Playwright
  scenarios, per the established pattern).
- Global fetch timeout in the transport (the 30 s wait timeout in 04 is scoped
  to the guest-send path only).

## Order

All four are independent (different files; 02 and 04 both touch chat but 02 is
list/open paths and 04 is the send pipeline). Suggested: 01 → 03 (trivial) → 02
→ 04 (most fiddly last, after the easy wins land).

## Definition of done (repo rules)

- `dotnet build` → 0 warnings (02 is the only backend change; no test project
  exists in the solution yet — verifying a test project is a separate plan).
- `pnpm typecheck` · `pnpm lint` → zero warnings.
- UI verified in a browser (Playwright, real Aspire stack): mobile + desktop,
  light + dark, en + ar — scenarios in each sub-plan's DoD.
- Plan files updated (status/decisions) · `COMMITS.md` appended · clean
  commit(s).

## Verification (2026-10-04, live Aspire stack, Playwright)

- **Core pass** `frontend/scripts/verify-chat-hiring-bugs.mjs` — 43/43 PASS
  (guest/staff/admin, mobile + desktop, light + dark; the 404→render, the
  403→claim-on-open, the dialog cap, and the send-race fixes).
- **Extras pass** `frontend/scripts/verify-chat-hiring-bugs-extras.mjs` —
  62/62 PASS. Covers the remaining checklist items of all four sub-plans and
  the full ar/RTL dimension:
  - **01:** image + PDF render on the GUEST and the STAFF side, lightbox
    opens, PDF pill is an absolute signed link, zero 4xx/5xx on `/files/**`,
    ar renders without horizontal overflow.
  - **02:** employee claims by clicking the `/chat` **list** row (not the
    inbox); **closed**-unclaimed variant opens + claims without 403; customer
    auto-open of their own thread is unchanged; ar list-click claim; zero 403
    responses on `/chat/**` for the whole sub.
  - **03:** dialog at the SHORT 900×620 viewport (body scrolls, Accept pinned
    visible, footer visible at top and bottom), app seeded through the REAL
    public form with 2 files + long text (image loads, PDF pill, history
    reachable), mobile dark ≤ 80dvh, ar/RTL fits 390 px with قبول pinned,
    Accept flow → one-time-password dialog, Decline flow → `declined`.
  - **04:** pre-bootstrap send lands exactly once (UI + DB); in-flight file —
    chip A consumed by send 1, chip B survives and goes with send 2, one
    attachment per message in the DB; bootstrap FAILURE → retry control, text
    kept, error shown, retry + resend works; closed thread (user mode) →
    composer replaced by the "conversation is closed" note.
- **Discovered during verification (pre-existing, OUT of scope — not fixed):**
  the mobile **site header** overflows the document by ~108 px (ar) / ~111 px
  (en) at a 390 px viewport whenever a **staff** user is signed in: row 1 holds
  the `shrink-0` logo + the two 44 px staff icon buttons (`AuthBadge`) + the
  chat CTA with its unread badge, which exceeds the 358 px content width
  (`site-header.tsx` — the "~20 px of headroom" comment covers the guest
  state only). Affects every staff page on phones in both LTR and RTL.
  Candidate for a small separate plan (e.g. hide one staff icon under
  `sm`/merge into a menu, or make the CTA badge truncate).
