# 05 — Works-rail "browse the full list" becomes a link + ar name هنادي

status: proposed

Frontend only. Asks 3 and 5.

## 1. Ask 3 — the works-rail foot is just text, not a link

`ProductRail`'s bottom row (`t("railFoot")` — "Or browse the full list —
every piece can be yours.") is a plain `<p>`. Make it a real `Link` to
`/works` (the products list page) — the whole text is the link:

- `Link` styled as the current muted text row (no button chrome), with
  `hover:text-foreground` + underline on hover, focus ring per the rest of
  the rail; keep the existing `ChevronDown` glyph in front (rotate kept as
  is), `aria-label` stays the foot text.
- The row scrolls into view with the rail (it already does — it's the last
  rail element); no other layout change.

## 2. Ask 5 — Hanadi in Arabic is هنادي

- `messages/ar.json`: all 10× **حنادي** → **هنادي** (Metadata.name
  "حنادي كروشيه" → "هنادي كروشيه", Nav.launcher, Works.allSubtitle,
  custom-offer body, ChatPanel label/title/opener/pickerEmpty/emptyThread/
  listEmpty — grep-verified 10/10, no other spelling variants).
- `frontend/scripts/verify-fab-exit.mjs`: the FAB locator asserts
  `aria-label='تحدّثي مع حنادي'` → updated to هنادي (the script must keep
  passing).
- en/tr files untouched (no Arabic there); no backend strings carry the
  name (grep-verified 0 hits in `src/`, `deploy/`).
- Brand feel check: the mark/wordmark elsewhere stays `hanadicrochet`
  (Latin) — only the Arabic persona spelling changes.

## Definition of done

- `pnpm typecheck` · `pnpm lint` green.
- Browser-verified (en + ar, mobile + desktop, light + dark): rail foot
  navigates to `/works` (clickable, focusable, RTL-correct); `ar` UI shows
  هنادي in the metadata/launcher/chat strings (spot-check
  `document.title`-level metadata + chat panel title + works subtitle).
