# 04 — Product CTA opens a NEW conversation with the work

status: done

Frontend only (`app/[locale]/chat/page.tsx` + `components/chat-panel.tsx`).
Ask 4 — owner delegated the decision ("not sure what's the best for our
system and UX"); decision + rationale in `main.md`.

## Decision (recorded)

**"Order in chat" from a product page = a fresh conversation about that
work.** A new order intent is a new conversation unit: staff claim/assign/
close per conversation, an order links to the conversation it was born in,
and the customer's list stays readable (one topic per thread).

Research (2026-10-03):

- Meta — WhatsApp Catalogs: "customers can view products, explore options,
  and place orders without leaving WhatsApp" — the catalog feeds the
  conversation, the order happens inside it:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/catalogs-overview/
- 72Technologies — WhatsApp commerce architecture (2026): in chat-native
  markets the funnel inverts; chat is "the storefront, the checkout, and
  the support desk":
  https://www.72technologies.com/blog/whatsapp-commerce-architecture-that-converts
- Infobip — WhatsApp Shop: "turn product questions into purchase-ready
  conversations": https://www.infobip.com/blog/whatsapp-shop

## Behavior

- **Logged-in customer** arrives at `/chat?work=<id>` with **no**
  `?thread=` (the product-page CTA): the page now creates the conversation
  first — `createThread({})` (customer thread, sub 02 of 20261002-1847) —
  then opens `?thread=<new>&work=<id>`; the existing `initialProductId`
  effect sends the work as the first message.
  - `?work=` WITH `?thread=` (explicit deep link) → unchanged (send into
    that thread).
  - Staff (who may technically hit the same URL): no auto-create (their
    createThread needs a customer); they land as today.
  - Create-failure → the existing `notice` row (no silent dead-end).
- **Guest** `?work=`: unchanged (device thread; product message as today) —
  the guest's "new conversation" is the capped reset (sub 01/02), not a
  hidden multi-thread surprise.
- **After the initial product message is accepted**, `?work=` is dropped
  from the URL (`router.replace` without the param) — in BOTH modes — so a
  page refresh no longer re-sends the product (pre-existing duplicate on
  refresh). The one-shot `sentInitialRef` guard stays as the second line.
- In-thread product bubble actions ("order this / custom like this") and
  the order-creation flows are untouched.

## Definition of done

- `pnpm typecheck` · `pnpm lint` green. ✅
- Browser-verified (mobile, light; en) via
  `frontend/scripts/verify-product-cta.mjs` (playwright-core vs system
  Chromium; the `ChatMessages` row count is the authoritative
  "sent exactly once" signal — the product bubble renders 1:1 from it):
  - **logged-in customer**: `/chat?work=<id>` (no `?thread=`) → a NEW thread
    is created + opened, the work is sent ONCE into it (exactly one product
    message; the thread renders it on the customer's side), `?work=` is
    dropped after the product is accepted, a refresh does NOT re-send it,
    and the new thread is the latest (auto-opened at `/chat`). ✅
  - **explicit `?thread=<t>&work=<id>`**: still sends into THAT thread (one
    product message lands in `t`, `?work=` is dropped, the first thread is
    untouched — no new thread). ✅
  - **guest**: `/chat?work=<id>` → the device thread gets the product ONCE,
    `?work=` is dropped, a refresh does NOT re-send it. ✅

  Note: per the plan's behavior section the thread is created with
  `createThread({})` (no subject). A product-only first message carries no
  text, so the thread subject stays empty and the list shows the
  `noSubject` fallback; the thread is unmistakably "about that work" because
  its first message is the product bubble. (Labeling the subject with the
  work's name would require the CTA to pass the name — out of scope here.)
