# 01 — Chat attachment images render (wrap URLs in fileSrc)

status: proposed

Frontend only. One component: `chat-panel.tsx` → `Attachments` (+ its
lightbox). Source: API-client plan, notes item 1.

## Bug (verified 2026-10-03)

`ChatService.cs:1328` returns attachment URLs relative + signed:
`/files/chat/{threadId}/{storedName}?sig=..&exp=..`. `Attachments` renders
`a.url` raw, so the browser resolves it against the web origin — :3000 in dev,
the Caddy web origin in prod — and neither serves `/files/*` → **every chat
attachment 404s** (images show broken; PDF links dead). Every other file
surface in the app already resolves API paths through `fileSrc()`
(`lib/api/client.ts:285` → `new URL(apiPath, API_BASE_URL).toString()`).

## Fix

In `frontend/src/components/chat-panel.tsx`:

- Import `fileSrc` from `@/lib/api/client` (same import the orders/staff
  components use).
- `Attachments`: `<img src={fileSrc(a.url)}>` for thumbnails;
  `href={fileSrc(a.url)}` for PDF pills.
- Lightbox: pass the resolved URL at the call site —
  `lightbox({ url: fileSrc(a.url), label: a.originalName })` — so the
  lightbox `<img src={lightbox.url}>` (a different image, opened from the
  thumbnail) also hits the API origin.
- Nothing else changes: the API still returns relative signed URLs on the
  wire; only the display layer resolves them. `new URL(path, base)` preserves
  the `?sig=&exp=` query string — verify once with a real signed URL.

Both broken contexts are fixed by the same resolution: dev
(`http://localhost:8085/files/…`, cross-origin — plain `<img>` loads need no
CORS) and prod (`/api/files/…` via `NEXT_PUBLIC_API_URL=/api`).

## Definition of done

- `rg "a\.url" frontend/src/components/chat-panel.tsx` → zero raw uses inside
  `Attachments`/lightbox calls.
- `pnpm typecheck` · `pnpm lint` green.
- Browser-verified (real stack, light + dark, en + ar, mobile + desktop):
  guest sends an image + a PDF in a visitor thread → both render on the guest
  side; staff (employee) opens the same thread from the Visitors inbox →
  images render there too; thumbnail tap → lightbox shows the full image;
  PDF pill opens the document; no console/network 404s.
