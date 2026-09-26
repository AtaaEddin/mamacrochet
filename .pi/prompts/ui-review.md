---
description: Visual/UX review of a screen or component (brand, mobile, themes, RTL, a11y)
argument-hint: "[screen or component]"
---
Do a UI review of ${1:-the screens changed in the current work} using the ui-design
skill and plan 11 (visual identity).

Verify:
1. Brand: feminine/soft/joyful feel, semantic tokens only (no arbitrary hex),
   hierarchy with one primary action, decoration tasteful + small.
2. Mobile-first: layout on a small phone (nav, forms, chat, touch targets ≥ 44 px).
3. Light + dark parity on the same screen.
4. Arabic RTL: dir handling, logical properties, chat bubbles/sheets mirrored.
5. Accessibility: contrast (AA), focus visibility, keyboard paths, accessible names,
   prefers-reduced-motion respected.

Open the page in a browser and check each item; fix what you find and report the
before/after.
