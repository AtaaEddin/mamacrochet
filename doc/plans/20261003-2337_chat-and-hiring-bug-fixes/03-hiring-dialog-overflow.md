# 03 — Hiring detail dialog: cap height, scroll body, pin header/footer

status: proposed

Frontend only. One component: `hiring-dialogs.tsx` → `DetailDialog`.
Source: API-client plan, notes item 3.

## Bug (verified 2026-10-03)

`DetailDialog` renders an unbounded content grid — contact (4 fields +
language badges), previous work, message, files (image thumbnails 28 px tall
in a wrap), history list, and the footer with Cancel/Decline/Accept — inside
a `max-w-2xl` `DialogContent` with **no height cap**. At viewport heights
≲ 1000px (and always on phones in landscape / small laptops) the
Accept/Decline buttons sit below the fold and are unreachable — the dialog
cannot be scrolled, so a `new` application cannot be accepted or declined.

## Decision (main.md)

shadcn/ui's official dialog recipe "Scrollable Content" is the baseline
(`<DialogContent className="max-h-[80vh] overflow-y-auto">` —
https://ui.shadcn.com/docs/components/base/dialog, retrieved 2026-10-03).
On top of it: keep the **header and the footer pinned** (the decision
buttons are the point of the dialog) and make only the content section
scroll. Mobile-first: cap on `80dvh` so the browser UI bar fits; the pinned
footer keeps the buttons in reach at every size.

## Fix

In `frontend/src/components/admin/hiring-dialogs.tsx` (`DetailDialog` only —
`AcceptDialog`/`DeclineDialog` are short fixed forms and were checked: they
fit; the inbox "New conversation" dialog already caps its list at `max-h-80`):

- `DialogContent`: `max-w-2xl` stays; add
  `flex max-h-[80dvh] flex-col overflow-hidden` (replaces the default
  single-column grid flow — the children are block-level, no grid behavior
  is relied on) + keep `gap-4` for header/footer spacing.
- The content `<div className="grid gap-5 text-sm">` becomes the scroll
  region: add `min-h-0 flex-1 overflow-y-auto` (and give it `pr-1` so the
  scrollbar doesn't touch the text at the edge; keep its internal
  `grid gap-5`).
- `DialogFooter` **moves out** of that div to be a direct child of
  `DialogContent` (last child) → pinned at the bottom, its existing
  `-mx-4 -mb-4 border-t` styling now lands at the true dialog bottom edge.
- The loading/error early-return states (spinner / retry alert) keep the
  same structure — they render instead of the content div, so the cap
  applies to them too.
- No changes to `components/ui/dialog.tsx` (the primitive stays generic).

## Definition of done

- `pnpm typecheck` · `pnpm lint` green.
- Browser-verified (real stack, light + dark, en + ar, **at a short viewport
  ≈ 900×620** and mobile):
  1. Open a `new` application with 2+ files and history → header visible,
     body scrolls, **Accept/Decline/Cancel stay visible at all scroll
     positions**.
  2. Accept flow (with the temp password report) and Decline flow both
     reachable at the short viewport.
  3. Long `previousWork`/`message` text scrolls without clipping; images in
     the files section load; history list fully reachable.
  4. `ar` (RTL): scrollbar on the correct side, footer buttons in the same
     positions, no overflow horizontally.
  5. Accept/Decline dialogs and the inbox New-conversation dialog unchanged
     (spot check, no regression).
