can you give me from the internet some agent useful files, to help it create beatifull UI, clean code (I use .Net 10, and latest typescript, nextjs, react). I also planning to host this on my old pc or raspberry pi, and btw I use PI harness 

Yes. Since you’re using Pi, I’d specifically use AGENTS.md + on-demand SKILL.md files, rather than one enormous prompt. Pi automatically loads AGENTS.md from the project and supports project/global skills and prompt templates.

For your stack:

Backend: .NET 10 / ASP.NET Core
Frontend: Next.js / React / latest TypeScript
UI: Tailwind v4 + shadcn/ui
Package manager: pnpm
Deployment: old PC / Raspberry Pi
Agent: Pi

I would use the following files.

1. Best starting point: Vercel React/Next.js agent rules

This is particularly useful because it's written specifically for coding agents, not humans. It contains 40+ React/Next.js performance rules covering waterfalls, bundle size, server/client boundaries, data fetching, etc.

React/Next.js Agent Best Practices — AGENTS.md

I'd put this into something like:

.agents/
  skills/
    react-best-practices/
      AGENTS.md

or adapt it into:

.pi/skills/react-best-practices/SKILL.md
2. shadcn/ui skill — very useful for beautiful UI

This is probably the most useful one for what you specifically asked for.

The official shadcn skill tells the agent how to:

find the correct component
use the CLI
inspect component documentation
compose components correctly
customize components
work with registries
avoid guessing APIs

The important part is that it's maintained by the actual shadcn project.

Official shadcn/ui SKILL.md

You can install it directly:

npx skills add shadcn-ui/ui --skill shadcn

For Pi, I'd probably put/copy the skill into:

.pi/skills/shadcn/SKILL.md

The official skill specifically recommends running the shadcn docs command before working with a component:

pnpm dlx shadcn@latest docs button dialog select

That is excellent for an agent because it prevents it from relying on stale training data.

3. shadcn customization / design-system reference

This is another one I'd give your UI agent.

shadcn customization.md

It covers:

semantic design tokens
CSS variables
OKLCH colors
dark mode
themes
border radius
component variants
customization patterns

That's much better than telling an agent vaguely:

"Make the UI beautiful."

You want it to understand that your application has a design system, rather than randomly choosing Tailwind classes on every page.

Tailwind itself now explicitly treats theme variables as design tokens for colors, typography, shadows, breakpoints, etc.

4. Next.js' own agent guidance

This is another one I strongly recommend.

Next.js AGENTS.md

The current Next.js project explicitly warns agents that APIs/conventions can differ from their training data and instructs them to consult the version-matched documentation.

Even better, current Next.js has moved its agent skills into the Next.js repository so they remain version-matched with Next itself.

You can install the current skills with:

npx skills add vercel/next.js

That's preferable to finding some old "Next.js best practices" prompt from 2024.

5. A good real-world Next.js + shadcn AGENTS.md

This is useful as a reference for how a real project structures its agent instructions:

Next.js + shadcn dashboard AGENTS.md

It has rules around:

Next.js 16
React 19
TypeScript
Tailwind CSS v4
shadcn/ui
feature-based structure

which is very close to the frontend stack you're describing.

Another interesting example is Gitpod's agent-generated Next.js application:

Gitpod memo AGENTS.md

That project explicitly uses:

Next.js 16
TypeScript strict
Tailwind
shadcn/ui
Vitest
Playwright

and describes rules for agent-generated code.

6. .NET / Microsoft Agent Framework guidance

For your .NET side, Microsoft's current repositories are also starting to use agent-specific guidance.

Microsoft Agent Framework AGENTS.md

It separates things such as:

build/test/lint
project structure
PR conventions
core abstractions

into skills/reference material rather than putting everything into the root agent instructions.

And Microsoft's current .NET AI material explicitly targets .NET 10+, Microsoft.Extensions.AI and Microsoft Agent Framework.

What I'd actually create for your project

Rather than copying 10 huge files, I'd make your project look like this:

your-project/
│
├── AGENTS.md
│
├── .pi/
│   ├── skills/
│   │   │
│   │   ├── ui-design/
│   │   │   └── SKILL.md
│   │   │
│   │   ├── shadcn/
│   │   │   └── SKILL.md
│   │   │
│   │   ├── nextjs/
│   │   │   └── SKILL.md
│   │   │
│   │   ├── react-performance/
│   │   │   └── SKILL.md
│   │   │
│   │   ├── dotnet/
│   │   │   └── SKILL.md
│   │   │
│   │   └── deployment/
│   │       └── SKILL.md
│   │
│   └── prompts/
│       ├── review.md
│       ├── ui-review.md
│       ├── refactor.md
│       └── deploy.md
│
├── frontend/
│   └── ...
│
└── backend/
    └── ...

And AGENTS.md should stay relatively small.

For example:

# Project Instructions

## Stack

### Backend
- .NET 10
- ASP.NET Core
- C#
- PostgreSQL
- REST APIs

### Frontend
- Next.js App Router
- React
- TypeScript strict mode
- Tailwind CSS v4
- shadcn/ui
- pnpm

## General Rules

- Prefer simple, readable code over clever abstractions.
- Do not introduce a dependency when the platform or existing project already provides the functionality.
- Reuse existing components before creating new ones.
- Never duplicate UI patterns when a reusable component is appropriate.
- Keep components focused and composable.
- Do not put business logic inside presentational components.
- Prefer server components in Next.js unless client-side interactivity is required.
- Minimize `"use client"` boundaries.
- Never guess APIs that may have changed. Consult the installed/version-matched documentation.

## UI

- Build a consistent design system rather than styling pages independently.
- Use shadcn/ui components where appropriate.
- Use semantic design tokens rather than hard-coded colors throughout the application.
- Prefer clean whitespace, hierarchy, typography and restrained visual effects.
- Avoid excessive gradients, shadows, rounded cards, animations and decorative elements.
- UI must work in light and dark mode.
- UI must be responsive.
- UI must be accessible.
- Do not sacrifice usability for visual effects.

## TypeScript

- Strict TypeScript.
- Avoid `any`.
- Prefer inferred types where obvious.
- Define explicit types at public/component/API boundaries.
- Do not use type assertions to silence errors without understanding the underlying type.

## Validation

Before considering a task complete:

1. Run type checking.
2. Run linting/formatting.
3. Run relevant tests.
4. Inspect the resulting UI when UI changes are made.
5. Fix issues instead of merely reporting them.

## Infrastructure

The application may run on low-power/self-hosted hardware.

Therefore:
- Avoid unnecessary services.
- Avoid memory-heavy dependencies.
- Prefer efficient caching.
- Avoid unnecessarily large client bundles.
- Do not introduce infrastructure solely for convenience.
- Keep Docker images small.
- Prefer stateless application processes where possible.

That gives Pi the always-on rules, while the detailed material lives in skills and is loaded only when relevant. This is also consistent with the Agent Skills guidance: keep SKILL.md focused and put detailed reference material elsewhere to reduce context usage.

One thing I'd add specifically for your UI

I'd create a custom:

.pi/skills/ui-design/SKILL.md

because generic coding agents are often technically correct but produce very generic-looking interfaces.

I'd give it rules like:

# UI Design Skill

## Goal

Create interfaces that feel intentionally designed rather than
assembled from generic Tailwind components.

## Visual hierarchy

Always establish:

1. Page hierarchy
2. Primary action
3. Secondary actions
4. Content grouping
5. Supporting information

Do not make every element visually prominent.

## Layout

Prefer:

- generous whitespace
- consistent max-widths
- predictable spacing
- clear alignment
- responsive layouts
- strong typography hierarchy

Avoid:

- unnecessary nested cards
- excessive borders
- excessive rounded containers
- random spacing values
- dense dashboards without hierarchy

## Components

Prefer:

- shadcn/ui
- semantic HTML
- reusable components
- composition over giant components

Before creating a new component, check whether an existing
component can be composed or extended.

## Colors

Use semantic design tokens.

Do not scatter arbitrary values such as:

bg-[#123456]

throughout the application.

Prefer semantic tokens:

bg-background
bg-card
text-foreground
text-muted-foreground
border-border
bg-primary

## Responsive behavior

Design mobile-first.

Do not simply shrink the desktop layout.

Consider:

- navigation
- tables
- forms
- dialogs
- sidebars
- touch targets
- content density

## Animation

Use animation only when it communicates:

- state changes
- hierarchy
- navigation
- feedback

Avoid decorative animation.

## Accessibility

Every interactive element must have:

- accessible name
- keyboard support
- visible focus state
- appropriate semantic element
- sufficient contrast

Do not use color as the only way to communicate state.

That complements shadcn particularly well because shadcn is deliberately open code and AI-ready, meaning the agent can directly understand and modify the component source rather than fighting an opaque component library.

And your Raspberry Pi / old PC changes the architecture slightly

I would not tell the agent simply:

"Optimize for Raspberry Pi."

That can cause it to prematurely optimize everything.

Instead give it a constraint like:

## Deployment Target

Production may run on a low-power self-hosted Linux machine
or Raspberry Pi.

Development hardware is significantly more powerful than the
production target.

Therefore:

- avoid unnecessary background workers
- avoid memory-heavy services
- avoid Elasticsearch unless explicitly required
- avoid Redis unless explicitly required
- avoid unnecessary containers
- avoid large client-side JavaScript bundles
- prefer server-side rendering where appropriate
- use database indexes instead of application-side filtering
- cache deliberately
- keep container images small
- keep startup time reasonable
- do not introduce infrastructure without explaining why it is needed

That is particularly relevant for Next.js + .NET 10, because you can have a surprisingly lightweight deployment if you don't turn the application into a collection of unnecessary services.

One more Pi-specific recommendation

Pi itself supports exactly the structure we're discussing:

~/.pi/agent/AGENTS.md       # global
project/AGENTS.md           # project
project/.pi/skills/         # project skills
project/.pi/prompts/        # reusable prompts

and Pi concatenates applicable AGENTS.md files as it walks from parent directories into the current project.

So I'd avoid putting the giant React/Next.js/shadcn documentation directly into AGENTS.md.

Use:

AGENTS.md
    ↓
always-loaded rules

.pi/skills/
    ↓
detailed knowledge loaded when needed

That's much better for your Qwen/Pi setup because you're not burning context on UI rules while asking the agent to fix a .NET database migration.

My recommended set
File	Purpose
AGENTS.md	Your project's permanent rules
ui-design/SKILL.md	Beautiful, consistent UI
shadcn/SKILL.md	Correct shadcn usage
react-performance/SKILL.md	React/Next performance
nextjs/SKILL.md	Current Next.js conventions
dotnet/SKILL.md	.NET 10 architecture/code quality
deployment/SKILL.md	Raspberry Pi/self-hosting constraints
prompts/ui-review.md	Ask Pi to visually/code-review UI
prompts/review.md	General code review
prompts/deploy.md	Production deployment checklist

The first four are the ones I'd install immediately. The official shadcn skill + Vercel React best-practices + version-matched Next.js guidance give your agent substantially better context than a generic "write clean React" prompt.

If you want, I can also 
assemble these into an actual .pi/ folder + AGENTS.md for your exact .NET 10 + Next.js + TypeScript + shadcn + Raspberry Pi stack, so you can drop it directly into the project.
