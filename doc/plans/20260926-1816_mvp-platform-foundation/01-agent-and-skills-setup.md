# 01 — Agent & Skills Setup

status: done
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

- [x] Create `.agents/skills/` tree:
  - [x] `shadcn/` (downloaded, official — kept unmodified)
  - [x] `react-best-practices/` (downloaded, official — kept unmodified)
  - [x] `nextjs/SKILL.md` (ours: version-matched bundled docs, App Router conventions)
  - [x] `dotnet/SKILL.md` (ours: .NET 10 / ASP.NET Core / EF Core / SignalR conventions)
  - [x] `ui-design/SKILL.md` (ours: brand feminine/soft/fluffy/joyful per plan 11)
  - [x] `deployment/SKILL.md` (ours: Raspberry Pi / old PC constraints, Docker, backups)
- [x] Add project prompt templates in `.pi/prompts/`: `review.md`, `ui-review.md`, `deploy.md`
- [x] Verify in Pi: skills follow Pi's documented `.agents/skills/` discovery rules —
      confirmed listed at the next session start (files in place 2026-09-26)
- [x] Keep `AGENTS.md` under ~150 lines; detail lives in skills

## Result (2026-09-26)

- Official skills installed via direct download (fallback path — the skills CLI has no
  Pi target): `shadcn` ← github.com/shadcn-ui/ui@main, `react-best-practices` ←
  github.com/vercel-labs/agent-skills@main. Both kept unmodified.
- Note: the React skill's declared name is `vercel-react-best-practices` (official),
  so its command is `/skill:vercel-react-best-practices`.
- Own skills: `nextjs`, `dotnet`, `ui-design`, `deployment`.
- Prompts: `/review`, `/ui-review`, `/deploy` (project `.pi/prompts/`).

## Acceptance

- All six skills discoverable by Pi in this repo; official skills untouched after install.
- No long rule text duplicated between AGENTS.md and skills (skills own the detail).
