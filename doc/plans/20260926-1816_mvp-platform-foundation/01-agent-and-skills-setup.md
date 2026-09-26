# 01 — Agent & Skills Setup

status: proposed
parent: main.md

## Goal

Give the Pi agent version-matched, on-demand knowledge: official upstream skills +
small project-specific skills. `AGENTS.md` stays small (always in context); deep
knowledge lives in skills (loaded only when relevant).

## Decisions (verified 2026-09-26)

- Skills location: `.agents/skills/<name>/SKILL.md` — portable Agent Skills format;
  Pi discovers project `.agents/skills/` from the working directory up to the repo root
  (Pi docs: skills.md; agentskills.io/specification).
- Installer CLI: `npx skills add <owner/repo> [--skill <name>]`
  (vercel-labs/skills, skills.sh — supports many agents including project `.agents`).
  Fallback (when the CLI has no target for Pi): download the same files directly from
  the repos into `.agents/skills/` and note the source URL inside the skill folder.
- Upstream skills to install:
  - shadcn (official): `npx skills add shadcn-ui/ui --skill shadcn`
    → github.com/shadcn-ui/ui/tree/main/skills/shadcn
    Rule inside: run `pnpm dlx shadcn@latest docs <components>` before touching a
    component — never guess the API.
  - react-best-practices (Vercel): `npx skills add vercel-labs/agent-skills --skill react-best-practices`
    → github.com/vercel-labs/agent-skills (40+ rules, 8 categories, CRITICAL→incremental).
- Next.js guidance: Next.js ships **version-matched docs inside the `next` npm package**;
  a local `nextjs` skill must point the agent at `frontend/node_modules/next/dist/docs/`
  + nextjs.org/docs/app/guides/ai-agents instead of relying on training data (Vercel evals
  show bundled-docs AGENTS.md guidance outperforms generic skills).
- `.NET` skill structure inspired by Microsoft Agent Framework's AGENTS.md split
  (build/test, project structure, conventions) — github.com/microsoft/agent-framework.

## Tasks

- [ ] Create `.agents/skills/` tree:
  - `shadcn/` (downloaded, official — keep unmodified)
  - `react-best-practices/` (downloaded, official — keep unmodified)
  - `nextjs/SKILL.md` (ours: App Router conventions, server vs client components,
    where the bundled version-matched docs live, caching rules for this app)
  - `dotnet/SKILL.md` (ours: .NET 10 / ASP.NET Core / EF Core / SignalR conventions,
    solution layout, warnings-as-errors policy, testing approach)
  - `ui-design/SKILL.md` (ours: **brand feel feminine/soft/fluffy/joyful per plan 11**,
    visual hierarchy, semantic design tokens, mobile-first, light/dark, RTL for Arabic,
    accessibility)
  - `deployment/SKILL.md` (ours: Raspberry Pi / old PC constraints, Docker, backups,
    low-power budget)
- [ ] Add project prompt templates in `.pi/prompts/`: `review.md`, `ui-review.md`, `deploy.md`
- [ ] Verify in Pi: startup diagnostics list all skills; `/skill:shadcn` etc. resolve
- [ ] Keep `AGENTS.md` under ~150 lines; move any overflow detail into a skill

## Acceptance

- All six skills discoverable by Pi in this repo; official skills untouched after install.
- No long rule text duplicated between AGENTS.md and skills (skills own the detail).
