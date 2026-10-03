# 04 — Product CTA opens a NEW conversation with the work

status: proposed

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

- `pnpm typecheck` · `pnpm lint` green.
- Browser-verified (mobile + desktop, light + dark, en + ar):
  - logged-in customer: product page CTA → a NEW thread (subject = the
    work's first words) with exactly one product bubble; refresh → no
    duplicate send; `/chat` list shows the new thread.
  - guest: product page CTA → device thread gets the product message once
    (refresh no longer duplicates).
  - explicit `?thread=&work=` still sends into that thread.
