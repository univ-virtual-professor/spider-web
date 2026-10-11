# spider-web

Web frontend (marketing site + admin panel + tenant-subdomain educator/student portals) for
**PrepareKaro** (internal codename "Univ Live" — see Naming note below), a multi-tenant SaaS for
coaching institutes running JEE/NEET/CUET/CBSE/board test series. React + TypeScript SPA with a
thin layer of Vercel serverless functions for anything that needs a server secret.

## Stack

- React 18 + TypeScript, Vite (SWC plugin), React Router v6
- Tailwind CSS + shadcn/ui (Radix primitives), `src/shared/ui/` (53 components)
- Firebase Auth (client) + Firestore (primary datastore for almost everything product-side)
- `api/` — Vercel serverless functions (TypeScript) for anything needing a server secret:
  Firebase Admin, Gemini/Vertex AI, Razorpay (legacy), ImageKit auth, tenant/employee admin ops
- Package manager declared as **Bun** (`bun.lock` is the lockfile) — **Bun is not installed on
  this machine**; all verification below used `npm`/`npx` directly against the existing
  `package.json`/`bun.lock`-independent install. If this repo's CI or a teammate's machine
  relies on bun-specific lockfile resolution, an `npm install` here will produce a different
  `node_modules` tree (no `package-lock.json` is committed, consistent with the gitignore).

## Install / run / build / test

All commands below run from the repo root.

- Install: `bun install` (declared) — **not verified** (bun absent). `npm install` — **verified**,
  completes cleanly (various deprecation warnings only, no fatal errors).
- Dev server: `bun run dev` → `vite` on `:8080` — **verified** via `npx vite --port 8099`, serves
  HTTP 200 at `/`. By default `/api/*` proxies to the production backend
  (`https://www.preparekaro.in`, see `vite.config.ts`); run `vite --mode vercel` + a separate
  `vercel dev` to proxy to local serverless functions instead.
- Build: `bun run build` → `vite build` — **verified** (`npx vite build`), succeeds in ~15s.
  Emits one JS chunk >4MB post-minification (~1.1MB gzip) — Vite warns about this; see
  `docs/agents/risks.md`.
- Lint: `bun run lint` → `eslint .` — **verified**, runs; reports 8 pre-existing errors (all
  `no-empty` on empty `catch`/`if` blocks in `api/_lib/parseAiJson.ts`,
  `src/features/educator/DppGenerator.tsx`, `src/shared/hooks/useAccessibleCourses.ts`) plus
  ~940 warnings (mostly `@typescript-eslint/no-explicit-any`, intentionally left as warnings —
  see the comment in `eslint.config.js`). None of this blocks `build`. Treat new errors (not
  pre-existing warnings) introduced by a change as a real lint failure.
- Type-check: no `tsc`/`typecheck` script in `package.json`; the project is split into
  `tsconfig.app.json`/`tsconfig.node.json` referenced from an empty-`files` root
  `tsconfig.json`. **Use `npx tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 5.0`** —
  **verified**; a plain `npx tsc -p tsconfig.json` checks nothing (empty `files: []`) and always
  reports zero errors, a trap for anyone assuming it works. The real command currently reports
  **21 pre-existing errors**; see `docs/agents/risks.md` for the list. `vite build` does not
  type-check (esbuild/SWC), so this is the only way to catch a real type error before it ships.
- Format check: `bun run format:check` → `prettier --check .` — **verified**; currently flags
  ~23 pre-existing unformatted files locally. CI (`.github/workflows/lint.yml`) runs this on every
  push/PR to `master`/`staging` via `bun`, so it's a real gate there even though it isn't clean
  right now with a plain `npm`/`npx` install — see `docs/agents/risks.md`.
- Tests: no `test` script in `package.json`. `vitest` + `@testing-library/*` are installed; real
  test files are still rare (`src/test/example.test.ts`, a placeholder, plus
  `src/features/student/practice/attemptKind.test.ts` from the portal revamp). Run via
  `npx vitest run` — **verified**, passes. Effectively no real test coverage for most of the app —
  see `docs/agents/risks.md`.
- Deploy: Vercel's GitHub integration. Production (preparekaro.in) is built from `master`,
  not from the base branch: work lands on `master_revamped` (see below) and never reaches
  production by being merged there. `master` must not be touched (owner's rule). Also
  triggerable manually via the `devops-bot` Discord bot's `/deploy` command. **Never run a
  deploy from here.**

## Org context

Part of the **preparekaro** org (`/Users/maulikgupta/mine/preparekaro/`), six repos total
(devops-bot, grade-engine, monkey-king, qbank-scraper, spider-app, spider-desktop, spider-web).
No `org.md` exists yet (not every sibling repo has been onboarded). From this repo's own code
and docs:

- **monkey-king** (Python/FastAPI) is the main backend: payments (Cashfree), coupons, seats,
  student invites, employee RBAC enforcement, the AI chatbot (RAG), DPP generation, analytics
  reports, personalized practice. This repo calls it via `VITE_MONKEY_KING_API_URL` (both
  directly from the client in some student-facing pages, and from a couple of `api/` functions
  for usage reporting).
- **grade-engine** (separate FastAPI service, own Postgres) handles AI-graded offline exam
  scanning/grading, called **directly** from this app (`VITE_GRADE_ENGINE_API_URL`), not proxied
  through monkey-king. Shares the same Firebase project, so the same ID token works on both.
  Not yet onboarded (no `project.md` in its folder as of this writing).
- **spider-app** (Expo/React Native) is the mobile client for the same product, sharing the same
  Firebase project and hitting the same monkey-king backend; some of its screens embed this
  repo's web pages via `react-native-webview`.
- **spider-desktop** detection/deep-linking: this repo pings `localhost:41337` and opens
  `preparekaro://launch?...` for proctored desktop exams (see `docs/agents/architecture.md`).
  Not yet onboarded.
- **devops-bot** is the Discord bot used to trigger/inspect this app's Vercel deployments.

## Naming note

Internally the product/repo set (GitHub org `univ-virtual-professor`, Linear team `univ-tasks`,
repo README/`CLAUDE.md` title "univ-live-new") still says **Univ Live**, but the actual shipped
brand, domain, metadata and structured data in this repo are all **PrepareKaro** /
`preparekaro.in` (see `index.html`, `src/shared/lib/tenant.ts`'s default domain). The repo's own
`README.md`/`CLAUDE.md` mention `univlive.tech` as the main domain and a now-removed
`api/razorpay/webhook.ts` / `api/billing/update-quantity.ts` — both stale; see
`docs/agents/risks.md` for what's actually drifted.

## Folder map (what matters)

```
src/
  app/
    providers/     AuthProvider, TenantProvider, QuestionActionsProvider
    routes/        adminRoutes, educatorRoutes, studentRoutes, publicRoutes (thin, no logic)
  features/
    admin/         Admin panel pages + components
    educator/      Educator portal pages + components (incl. examGrading/, test-series/)
    student/       Student portal pages + components + types.ts (incl. examResults/)
  entities/        Reusable domain models (mostly still empty — see REPO_STRUCTURE.md)
  widgets/layout/  Navbar, LandingNavbar, Footer, LandingFooter, Layout, LandingLayout, AnnouncementBar
  shared/
    auth/          RequireRole, RequirePermission (route guards; RequirePermission renders
                    DsPermissionNotice in place for an out-of-scope deep link, not a redirect)
    components/    common/, home/, sections/, MultiFileDropzone, ImpersonationBanner, NavLink
    contexts/      EmployeeContext (employee permissions/role-template name, branch scope)
    hooks/         useAIStream, useAccessibleCourses, use-mobile, use-toast
    lib/           firebase.ts, tenant.ts, rolesConfig.ts (RBAC source of truth), utils.ts, ...
    routes/        StudentRoute guard
    services/      authService, tenantService
    ui/            shadcn/ui primitives (53 components) — reuse these before adding new ones;
                    `ui/ds/` is a second, additive "ds-*" primitive set for the portal revamp
                    (see design.md) — role-based sidebar shell (EducatorLayout/StudentLayout) plus
                    shared screen states (DsEmpty, DsSkeletonRows, DsInlineError,
                    DsPermissionNotice, DsFrozenBadge)
  pages/           Public/marketing pages only (Index, Login, Signup)
  themes/coaching/ Multi-tenant theming for tenant home pages (theme1-3, builder, shared)
  AppRoutes.tsx    Root router — tenant vs main-domain split
  App.tsx          Providers + React Query client
  main.tsx         Entry point
api/               Vercel serverless functions (see docs/agents/architecture.md)
  _lib/            Shared utils: firebaseAdmin, geminiModel, razorpayRequest (now unused —
                    see risks.md), requireUser, discordLogger
public/            Static assets, favicons, logos, sitemap.xml, robots.txt
docs/agents/       This onboarding's architecture.md and risks.md; mockups/revamp/ holds the
                   portal revamp's spec (BUILD-NOTES.md, PLAN.md, Desktop Portal.dc.html,
                   faculty-report-api.md) — read alongside design.md for any ds-* portal screen
```

Full structure/alias rules are already documented in `REPO_STRUCTURE.md` (path aliases:
`@app`, `@features`, `@entities`, `@widgets`, `@shared`, `@/*`) — read that alongside this file.
`CLAUDE.md` and `README.md` at the repo root are the pre-existing, much more detailed
route-by-route / feature-by-feature references; they are mostly accurate but have some drift
from the current code (see `docs/agents/risks.md`) — verify against the actual source before
trusting a specific claim in them.

## Coding conventions actually used

- Prettier: double-quote-off (`singleQuote: false`), semicolons on, 100-char width, Tailwind
  class sorting via `prettier-plugin-tailwindcss` (`.prettierrc`).
- ESLint (`eslint.config.js`): `@typescript-eslint/no-explicit-any` is a **warning**, not an
  error — `any` is pervasive in Firestore `.data()` casts and is tolerated intentionally. Unused
  imports/vars are enforced via `eslint-plugin-unused-imports` (prefix with `_` to allow an
  intentionally-unused var/arg). `no-empty` block statements are real errors — don't add one.
- Husky + lint-staged runs ESLint (`--fix`) and Prettier on staged `.ts/.tsx` on commit; `.md`
  gets Prettier only.
- Feature-first architecture (see `REPO_STRUCTURE.md`): route files are declaration-only; a
  component moves to `entities/` or `shared/` once 2+ features need it; `pages/` is
  public/marketing only.
- Git history favors small, imperative one-line commit subjects (e.g. "Fix PDF import failing on
  malformed pages with unfriendly error").

## Links

- `docs/agents/architecture.md` — modules, data flow, Firestore/Postgres data shapes, external
  services, env vars, entry points.
- `docs/agents/risks.md` — fragile areas, doc drift, missing coverage, things not to touch
  without a human.
- `design.md` — colors/typography/spacing tokens, shared components, layout patterns.
- `REPO_STRUCTURE.md`, `README.md`, `CLAUDE.md` — pre-existing, detailed, repo-root docs (see
  drift note above).
