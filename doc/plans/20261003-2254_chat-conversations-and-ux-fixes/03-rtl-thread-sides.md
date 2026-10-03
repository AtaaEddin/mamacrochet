# 03 — RTL: conversation sides must not flip in Arabic

status: done

Frontend only (`chat-panel.tsx`). Ask 2: "even switching to Arabic the
conversation sides shouldn't flip sides".

## Bug

`MessageRow` positions the two sides with logical (inline) alignment —
mine: `self-end`, staff: start-aligned row with the avatar first. In a
flex column, `inline-end` follows the document direction, so in `ar`
(RTL) the customer bubbles move to the LEFT and the staff side (avatar +
text) to the RIGHT — the conversation visually flips.

## Fix (targeted, no layout redesign)

- The thread's message column (the `max-w-2xl` wrapper inside the scroll
  area) gets `dir="ltr"` — a fixed, document-direction-independent
  geometry: customer side ALWAYS right, staff (avatar) ALWAYS left, in
  every locale.
- Message body paragraphs (`whitespace-pre-wrap break-words …`) get
  `dir="auto"` so each line of text still starts on the right side in
  Arabic and left in English/Turkish (natural alignment per content).
- The "Sending…" / failed-send labels stay physically pinned where they
  are now (`text-end` inside the now-LTR column = right — as designed).
- Nothing outside the message column changes: top bar, composer chips,
  picker, rail keep normal RTL behavior (an RTL composer is fine — the
  owner asked only about the conversation sides).

## Definition of done

- `pnpm typecheck` · `pnpm lint` green. ✅
- Browser-verified in `ar` AND `en` (mobile + desktop, light + dark):
  customer bubble right, Hanadi avatar left, Arabic body text starts from
  the right, product bubbles + attachments unaffected. ✅

  Verified by `frontend/scripts/verify-rtl-thread-sides.mjs` (playwright-core
  vs system Chromium): one thread holding a customer + a staff (Hanadi)
  message, rendered in `en` and `ar` on mobile + desktop, light + dark. The
  message column is `dir="ltr"`, the body paragraphs `dir="auto"`, the Arabic
  body computes `direction: rtl` (right-aligned), the customer bubble sits to
  the right of the staff avatar, and the customer↔staff span is unchanged
  `en`→`ar` in every config (the sides never flip). Note: on desktop the
  whole message column shifts because the 3-column layout mirrors in RTL —
  that is the expected surrounding-layout mirroring, not a conversation-side
  flip (the relative span is identical).
