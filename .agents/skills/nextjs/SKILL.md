---
name: nextjs
description: Next.js 16 App Router conventions for hanadicrochet. Use when creating or changing pages, layouts, server/client components, data fetching, caching, navigation, or anything Next.js-specific in frontend/.
---

# Next.js (hanadicrochet)

**Never guess APIs.** Version-matched docs ship inside the `next` package — read them
before using anything you are not 100% sure about:

- Docs root: `frontend/node_modules/next/dist/docs/`
- Start from the App Router guide there, then the specific how-to.

## Project conventions

- App Router under `frontend/src/app/`; TypeScript strict (extends root `tsconfig.json`).
- Server Components by default. `"use client"` only where state/effects/interactivity
  is required, and as low in the tree as possible.
- Data fetching: server components fetch from the API server-side (internal http URL).
  Client components use the typed API client only for user-driven or realtime data.
- Realtime (chat) lives in one isolated client module (SignalR); don't scatter socket
  handling across components.
- i18n: next-intl. Every user-facing string lives in message catalogs (en/ar/tr) —
  never inline literals. `<html dir>` is set from the negotiated language
  (ar → rtl).
- Styling: Tailwind v4 + shadcn/ui tokens only (see `ui-design` skill for brand rules).
- Low-power target: keep client JS lean; `next/image` or API-served webp/avif;
  explicit caching/revalidation; prefetch primary routes.

## Commands

- dev: `pnpm dev` (or via Aspire AppHost)
- checks: `pnpm typecheck` · `pnpm lint` · `pnpm test`
