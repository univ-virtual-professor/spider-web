# Risks and fragile areas

## Missing test coverage

- There is **no `test` script in `package.json`**. A couple of real unit test files now exist
  from the portal revamp (`src/features/student/practice/attemptKind.test.ts`, alongside the
  pre-existing placeholder `src/test/example.test.ts`), run via `npx vitest run` (verified,
  passes). Coverage is still essentially nonexistent for the bulk of the app — RBAC permission
  checks, payment status handling, tenant/domain resolution, and nearly everything in the new
  `ds-*` portal screens have zero regression safety net. Be extra careful with manual
  verification on these, and consider adding a real test alongside a risky change rather than
  trusting lint/build/manual QA alone.
- ESLint currently reports **8 pre-existing errors** (`no-empty` on empty `catch`/`if` blocks in
  `api/_lib/parseAiJson.ts`, `src/features/educator/DppGenerator.tsx`,
  `src/shared/hooks/useAccessibleCourses.ts`) and ~940 warnings (mostly intentionally-tolerated
  `any`). Don't let a ticket silently add a 9th error — check `npx eslint .` before and after.
- **Type-checking must use `npx tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 5.0`** —
  `tsconfig.json` has `"files": []` and only references the app/node project configs, so a plain
  `npx tsc -p tsconfig.json` (or bare `npx tsc`) silently checks **nothing** and will report zero
  errors even with real type errors in `src/`. The real command currently reports **21
  pre-existing errors** (verified), spread across `TestForm.tsx`, `MathRichTextEditor.tsx`
  (missing CKEditor type packages), `InstituteBuilder.tsx`, `QuestionsManager.tsx`,
  `TestSeries.tsx`, `WebsiteSettings.tsx` (4), `StudentResults.tsx` (2), `CompleteProfile.tsx`
  (2), and three `home/` landing components (`gradient` not a valid button variant). None of
  these block `vite build` (esbuild/SWC don't type-check). Don't let a ticket silently add a 22nd
  error — run the real command before and after, not the no-op one.
- Prettier is checked by CI (`.github/workflows/lint.yml` runs `bun run format:check` on every
  push/PR to `master`/`staging`), not just lint — a change that passes ESLint but isn't
  Prettier-formatted still fails CI. Running `npx prettier --check .` locally currently flags
  ~23 pre-existing unformatted files; that's a pre-existing gap between the repo and CI's `bun`
  install, not something to silently "fix" in an unrelated ticket's diff.

## Documentation drift — verify before trusting

`README.md` and `CLAUDE.md` at the repo root are detailed but **not fully current**:

- Both describe the main domain as `univlive.tech`; the actual deployed brand, `index.html`
  metadata/structured data, and `src/shared/lib/tenant.ts`'s hardcoded default domain are all
  `preparekaro.in`. Don't ship a change that assumes `univlive.tech` is live.
- `CLAUDE.md`'s Payments section references `api/razorpay/webhook.ts` and
  `api/billing/update-quantity.ts` — **neither file exists in the current tree** (confirmed via
  `find api -type f`). Payments appear to be fully handled by `monkey-king` (Cashfree) now;
  `api/_lib/razorpayRequest.ts` still exists but has **no importer anywhere in `api/`** — it's
  dead code from a removed integration, not a live legacy path. Don't assume Razorpay env vars
  (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`) are actually wired to anything without re-checking.
- This onboarding pass didn't attempt to reconcile `CLAUDE.md`/`README.md` with the code —
  that's a larger job than a docs-read pass can safely do. A future ticket could update them,
  but don't take the route tables, env var list, or "Key Integrations" sections at face value
  for anything safety-critical (billing, auth) without checking the actual source first.

## Build / bundle

- `vite build` emits one JS chunk over 4.2MB (minified, ~1.14MB gzip) with Vite's own warning
  about chunk size. Not a functional bug, but a real performance risk (slow first load on poor
  connections) and a sign nothing in this app code-splits by route. Don't add large new
  dependencies to the main bundle without checking whether dynamic `import()` is warranted.

## Package manager mismatch

- `package.json`'s `name` is still the generic Lovable-scaffold default
  (`vite_react_shadcn_ts`), and the declared package manager is Bun (`bun.lock` committed), but
  **Bun is not installed on this machine** and all verification for onboarding used
  `npm`/`npx` directly. No `package-lock.json` is committed (gitignored), so an `npm install`
  here produces an independent `node_modules` resolution that may not exactly match what `bun
install` would produce from `bun.lock`. CI (`.github/workflows/lint.yml`) uses
  `oven-sh/setup-bun` + `bun install`/`bun run lint`/`bun run format:check` — so CI's install is
  authoritative, not whatever a human/agent gets from `npm install` locally. If a dependency
  version mismatch ever causes a local-vs-CI discrepancy, check whether Bun is available before
  assuming it's a code bug.

## `vercel.json` has unrelated rewrites

- `vercel.json`'s `rewrites` array includes four routes (`/api/orders/accept`,
  `/api/orders/mark-dispatched`, `/api/orders/invoice`, `/api/admin/assign-pickup`) proxying to
  `https://drippr-seller-serverless.vercel.app` — a domain name that has nothing to do with
  PrepareKaro/coaching institutes and doesn't match any other reference anywhere in this repo or
  its siblings. This looks like config copied from an unrelated project (or a shared Vercel
  team's template) and never cleaned up. **Don't touch `vercel.json` without a human confirming
  whether these routes are still intentionally live** — removing them could break something
  outside this repo's visible scope if they are, and leaving them could be actively routing
  traffic to an unrelated third party's backend if they aren't. Flag, don't silently fix.

## Favicon / site identity gap

- `public/` has `favicon.png` (1254×1254) and `favicon.svg`, but **neither is linked from
  `index.html`**, and there is **no `/favicon.ico` at the repo/site root at all**. The actually
  linked icon (`rel="icon"` and `rel="apple-touch-icon"`, both `/logo-compact.png`) is a raster
  PNG ≥48px, so this isn't the "SVG-only favicon" failure mode from the org's known issue list,
  but it's still short of the full recommended set (`/favicon.ico` at 16/32/48px). Low priority,
  but worth a ticket if anyone revisits the site's SEO/branding.

## Portal revamp (PRs #9-#17): Firestore rules and indexes

- **New top-level `examResults` collection (`src/shared/lib/examModel.ts`) has no Firestore
  security rule yet.** `ExamSchedule.tsx`'s "Record marks"/"Release results" writes and the
  report card's reads will be rejected in production until one is added (rules are managed
  entirely outside this repo — see "Documentation drift" above). The rule needed: create/
  update/delete only by the owning educator (`request.auth.uid ==
resource.data.educatorId`) or one of that educator's employees with the `tests.publish`
  permission, scoped to students in their own institute; read allowed for that same educator,
  and for a student **only** on docs where `studentId == request.auth.uid` — never a broader
  read, since that would let a student query classmates' marks. Rank is written server-side-
  equivalent by the educator at release time (`ExamSchedule.tsx`'s `recomputeRanks`), not
  computed from a client-side cross-student read, specifically to avoid needing a wider read
  rule — but the per-student read rule above is still required for a student's own report card
  to load.
- **Composite Firestore indexes needed for queries the revamp added or that share the
  `attempts` collection with revamp screens** (two or more `where()` on different fields,
  or a `where()` plus `orderBy()` on a different field, combined in one query — these fail at
  runtime with a Firestore "missing index" error and a console link, not a build-time failure):
  - `attempts`: `educatorId` (==) + `studentId` (==) + `orderBy(createdAt, desc)` — used by
    `StudentDetails.tsx` (new, faculty-facing attempt history) and already shared by
    `StudentAllResults.tsx`, `StudentAttempts.tsx`, `StudentDashboard.tsx`,
    `usePracticeHistory.ts`.
  - `attempts`: `studentId` (==) + `status` (==) + `orderBy(createdAt, desc)` — used by
    `ReportCard.tsx` (new, ad-hoc test history) and `StudentGrades.tsx`.
  - `attempts`: `studentId` (==) + `educatorId` (==) + `testId` (==) + `status` (==) +
    `orderBy(submittedAt, desc)` — `StudentTestDetails.tsx`.
  - `attempts`: `educatorId` (==) + `pendingManualReviewCount` (>) + `orderBy(pendingManualReviewCount, desc)` +
    `orderBy(submittedAt, desc)` — `SubjectiveReviewQueue.tsx` (pre-existing, not touched by the
    revamp, but shares the collection).
  - `attempts`: `educatorId` (==) + `createdAt` (range) + `orderBy(createdAt, asc)` —
    `Analytics.tsx` (educator).
  - None of these indexes are defined in this repo (no `firestore.indexes.json` exists here
    either) — Firestore auto-prompts to create the missing index the first time each query runs
    against real data, via a console link in the thrown error. Until created, the owning screen
    silently shows an empty/error state rather than crashing the app. If a ticket adds a new
    query combining an equality filter on one field with an `orderBy`/range on a different
    field against `attempts` (or any other collection), expect the same failure mode and flag it
    for a human to create the index rather than guessing it will "just work" in production.

## Portal revamp: known gaps (code wins — these are documented in code comments, not bugs to fix blindly)

- **Faculty scope is enforced server-side only, not in this repo.** `FacultyToday.tsx`,
  `StudentDetails.tsx`'s Analysis tab and `StudentsListing.tsx`'s weakest-topics/at-risk columns
  call monkey-king's batch-scoped report endpoints (`GET /api/reports/students/{student_id}`,
  `GET /api/reports/batches/{batch_id}/students` — spec in
  `docs/agents/mockups/revamp/faculty-report-api.md`) instead of reading Firestore directly, so
  that monkey-king's rule #7 `get_batch_scope` check (a separate repo) is what actually keeps a
  teacher from seeing another teacher's batch — this repo has no equivalent check of its own.
  **This means spider-web's screens depend on monkey-king's matching endpoints being deployed**;
  until then these calls 404/error and the UI degrades (a permission notice, or the extra
  columns just not appearing) rather than breaking, but the feature doesn't work. This repo's
  own direct Firestore reads (e.g. `examResults`, `attempts`) still rely entirely on Firestore
  rules living outside this repo — there is no client-side enforcement of batch/institute scope
  beyond whatever query filters a screen happens to add, and those are not a security boundary.
- **No `room` field anywhere in the data model.** A `Timetable` slot only carries
  subject/teacher/day/time/mode (`src/features/educator/Timetable.tsx`). Room-conflict
  detection, a rooms filter, and room-utilisation metrics from the original design spec are
  absent by design, not an oversight — adding them means inventing a new collection, not filling
  a UI gap. Don't build "fix the room conflict bug" tickets against this; there is no room data
  to conflict on.
- **No `hint` field on a question anywhere in this repo or its siblings.** The student practice
  player (`PracticePlayerView.tsx`) deliberately has no hint button for this reason — a backend
  addition (question schema + whichever service authors questions) would be needed first. Don't
  invent placeholder hint text.
- **Rank is exam-wide, not batch-scoped.** `ExamSchedule.tsx`'s `recomputeRanks` ranks every
  student who sat a given exam against every other student who sat it, across all target
  batches, not per batch — there is no batch-scoped rank anywhere in the app. A report card
  showing "3 / 240" means rank across the whole exam, not the student's own batch.
  `BatchesListing.tsx` also has no per-batch "average test score" for the same underlying reason:
  `attempts` docs carry no `batchId`, so a per-batch aggregate isn't affordable without a wider
  scan or a monkey-king change — the Batches screens intentionally omit one rather than show a
  fabricated number.
- **Parent notifications don't exist anywhere in this app.** Faculty Attendance's short-
  attendance list (students below 75% term-to-date) has no "notify parents" action — monkey-king
  has no per-student or SMS notification path, only a batch-wide broadcast, so there is nothing
  to call. A ticket to "notify the parent" needs a monkey-king change first, not a client-side
  fix here. Likewise there is no `guardianName`/`guardianPhone` write path anywhere in this app
  (no enrolment or invite flow captures guardian contact info) — the Guardian column on
  `/educator/students` reads those fields if present and shows "—" otherwise; it isn't backed by
  real data until some other process starts populating them.

## `VITE_MONKEY_KING_ADMIN_KEY` is a client-exposed admin credential (pre-existing, not revamp-related)

- `src/features/admin/QuestionPaperRequests.tsx`, `CouponManagement.tsx`, `PaymentLogs.tsx`,
  `ContentLibrary.tsx` and `SeatManagement.tsx` all read `import.meta.env.VITE_MONKEY_KING_ADMIN_KEY`
  and send it as a `Bearer` token to monkey-king admin endpoints. Because of the `VITE_` prefix
  it is baked into the public JS bundle like every other client env var — anyone who opens
  devtools on the admin panel can read it. This looks like an admin-only API key that should be
  minted server-side (e.g. from an `api/*` function using `requireUser()`'s role check) rather
  than shipped to the browser. Flag to a human before changing how it's used; this onboarding
  pass didn't attempt a fix since it's a pre-existing security design choice, not something the
  portal revamp introduced.

## Auth / secrets handling (as implemented, not verified against a live deployment)

- Server-side Firebase credentials arrive as `FIREBASE_SERVICE_ACCOUNT_JSON` or
  `_JSON_BASE64` and go through a notably defensive multi-candidate JSON parser
  (`api/_lib/firebaseAdmin.ts`) to tolerate hosting-dashboard mangling (smart quotes, extra
  escaping, wrapped-in-quotes, etc.). This complexity exists because that env var has apparently
  broken in production before — if a future bug report mentions "Firebase Admin init failed" in
  the Vercel functions, look here first rather than assuming the service account itself is wrong.
- `requireUser()` (`api/_lib/requireUser.ts`) verifies the bearer ID token then loads the
  caller's Firestore profile and role — every `api/*` handler that touches privileged data
  (invite-employee, update-seats, change-slug, delete-student) depends on this one function
  being called correctly with the right `roles` filter. A ticket editing any of these handlers
  should double check `requireUser`'s role check wasn't accidentally dropped or weakened.
- No `.env.example` exists in this repo, so there's no single documented list of required env
  vars — `docs/agents/architecture.md`'s env var list was built by grepping call sites, not from
  a template. Treat it as a floor, not a guarantee of completeness.

## Don't touch without a human

- `vercel.json` rewrites to `drippr-seller-serverless.vercel.app` (see above).
- Anything resembling `api/razorpay`-style payment webhook handling — the actual legacy Razorpay
  webhook file referenced in `CLAUDE.md` no longer exists; re-introducing payment webhook code
  here without confirming with monkey-king's current design (Cashfree is now canonical) risks
  double-handling or conflicting with the real payment flow.
- `firestore.rules` — not present in this repo at all; any change that assumes new Firestore
  read/write permissions needs a human to apply rules in whatever system actually manages them
  (per `CLAUDE.md`'s note, managed entirely outside this repo). This includes the missing
  `examResults` rule and any new Firestore composite index above — a human needs to actually
  create them before the affected screens work against real data.
- Deploys: production (preparekaro.in) is built from `master` via Vercel's GitHub integration;
  all work goes to `master_revamped`, which does not deploy to production. Never push, merge or
  open PRs to `master`, and never trigger a manual deploy via `devops-bot`'s `/deploy` from an
  agent turn.
