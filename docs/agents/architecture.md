# Architecture

## What owns what

| Area                     | Owner                                                                                                                                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing / domain split   | `src/AppRoutes.tsx`                                                                                                                                                           | Decides tenant-subdomain vs main-domain at the root, then delegates to `src/app/routes/*Routes.tsx` (admin/educator/student/public — declaration-only, no business logic per `REPO_STRUCTURE.md`).                                                                                                                                                                                                                                                                                                                                                                                                            |
| Auth state               | `src/app/providers/AuthProvider.tsx` + `src/shared/lib/firebase.ts`                                                                                                           | Firebase Auth client SDK; role (`ADMIN`/`EDUCATOR`/`STUDENT`) is read from Firestore `users/{uid}.role` and from Firebase custom claims.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Tenant resolution        | `src/app/providers/TenantProvider.tsx` + `src/shared/lib/tenant.ts`                                                                                                           | Subdomain (`{slug}.<domain>`) or a `?tenant=` query param (preview hosts) resolves which educator's Firestore config to load. Default base domain is `preparekaro.in`; overridable via `VITE_APP_DOMAINS`/`VITE_APP_DOMAIN`/`VITE_APP_BASE_DOMAIN`.                                                                                                                                                                                                                                                                                                                                                           |
| Route guards             | `src/shared/auth/RequireRole.tsx`, `src/shared/auth/RequirePermission.tsx`, `src/shared/routes/StudentRoute.tsx`                                                              | Role guard, fine-grained employee-permission guard (`anyOf`/`ownerOnly`), and student-enrollment guard respectively.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Admin panel              | `src/features/admin/`                                                                                                                                                         | Educator/plan/coupon/seat/content/question-bank management, roles management (seeds `DEFAULT_ROLES`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Educator portal          | `src/features/educator/`                                                                                                                                                      | `Dashboard.tsx` is a thin role dispatcher (`lib/educatorRole.ts`'s `resolveEducatorPortalRole`) rendering `OwnerOverview.tsx` or `FacultyToday.tsx` (Ops has no overview and is redirected to its own first nav item); plus batches (`BatchesListing.tsx`), students (`StudentsListing.tsx`, `StudentDetails.tsx`), test-series + question editor, question bank, content, analytics, billing, DPP generator (`DppGenerator.tsx`, `ScheduledDpps.tsx`), exam scheduling/marks (`ExamSchedule.tsx`) and grading (`examGrading/`), organization (branches/programs/employees), curriculum/timetable/attendance. |
| Student portal           | `src/features/student/`                                                                                                                                                       | Dashboard, tests, attempts (`StudentCBTAttempt.tsx` — serves both the live proctored test player and, via `PracticePlayerView.tsx`, the practice player, branching on the test doc's `type`), results, rankings, content, AI chatbot, personalized practice generator (`practice/`), exam results (`examResults/`).                                                                                                                                                                                                                                                                                           |
| Role-based portal shell  | `src/features/educator/EducatorLayout.tsx`, `src/features/student/StudentLayout.tsx`                                                                                          | Fixed sidebar + top bar, nav generated per role (Owner/Faculty/Ops educator-side, Student). See `design.md`'s "Portal shell" section for the nav-to-route mapping.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Shared screen primitives | `src/shared/ui/ds/index.tsx`                                                                                                                                                  | `ds-*` design-system components (page header, KPI row, tables, empty/loading/error/permission/frozen states) used across the whole educator/student portal — see `design.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Employee RBAC            | `src/shared/lib/rolesConfig.ts` (single source of truth: `PERMISSIONS`, `PERMISSION_LABELS`, `PERMISSION_GROUPS`, `DEFAULT_ROLES`); `src/shared/contexts/EmployeeContext.tsx` | `employeePermissions.ts` is a re-export shim pointing at `rolesConfig.ts`, not a separate source.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Multi-tenant theming     | `src/themes/coaching/{theme1,theme2,theme3,builder,shared}/`                                                                                                                  | Selected per-tenant via Firestore; `TenantHome.tsx` variants render the themed public tenant home page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Serverless functions     | `api/` (Vercel functions, one file = one endpoint)                                                                                                                            | Anything needing a server-side secret (Firebase Admin, Vertex AI, Razorpay, ImageKit auth). See table below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Shared function utils    | `api/_lib/`                                                                                                                                                                   | `firebaseAdmin.ts` (Admin SDK init from `FIREBASE_SERVICE_ACCOUNT_JSON[_BASE64]`), `requireUser.ts` (Bearer-token auth + role check + Firestore profile fetch), `geminiModel.ts`, `parseAiJson.ts` (Vertex AI client + JSON-repair for model output), `razorpayRequest.ts` (now unused, see risks.md), `discordLogger.ts`, `readRawBody.ts`, `pdfQuestionImport.ts`, `aiStreamingUtils.ts`.                                                                                                                                                                                                                   |

## Data flow

1. **Browser → Firebase directly** for most reads/writes (Firestore client SDK with offline
   persistence, `src/shared/lib/firebase.ts`). This is the default path for product data —
   no backend round-trip for most CRUD.
2. **Browser → `api/*` (Vercel functions) → Firebase Admin / Vertex AI / Razorpay** for anything
   needing a secret or elevated privilege: student registration/org invites (writes Firestore
   - Firebase Auth as admin), AI question import/subjective evaluation (calls Vertex AI, writes
     results back to Firestore), ImageKit upload auth tokens, seat assign/revoke.
     `requireUser()` is the common entry guard — verifies the Firebase ID token, loads the
     caller's Firestore `users/{uid}` profile, optionally checks `role` against an allow-list.
3. **Browser → `monkey-king` (separate Python/FastAPI repo)** directly, via
   `VITE_MONKEY_KING_API_URL` + the user's Firebase ID token as Bearer auth — used for payments,
   personalized practice generation, performance reports, org roster lookups, and (added for the
   portal revamp, monkey-king PR #3) two faculty-facing report endpoints consumed by
   `StudentDetails.tsx`'s Analysis tab and `StudentsListing.tsx`'s weakest-topics/at-risk columns:
   `GET /api/reports/students/{student_id}` and `GET /api/reports/batches/{batch_id}/students`
   (spec in `docs/agents/mockups/revamp/faculty-report-api.md`). Both are batch-scoped
   server-side (monkey-king's own rule #7) rather than filtered client-side — see
   `docs/agents/risks.md`. Some `api/*` functions (`evaluate-subjective.ts`,
   `import-test-questions.ts`) also call monkey-king's `POST /api/ai/report-usage`
   server-to-server after a successful AI call, non-blocking.
4. **Browser → `grade-engine` (separate FastAPI repo, own Postgres)** directly, via
   `VITE_GRADE_ENGINE_API_URL`, for offline-exam photo upload/extraction/grading. Same Firebase
   project as monkey-king, so the same ID token authenticates both backends.
5. **Browser → `spider-desktop`** (same machine, not a network service) via
   `fetch("http://localhost:41337/ping")` for app detection and a
   `preparekaro://launch?testId=X&tenantSlug=Y&idToken=Z&assignmentId=A` deep link to hand off a
   proctored exam attempt.
6. **Vite dev proxy**: `/api/*` requests in `bun run dev`/`vite` proxy to
   `https://www.preparekaro.in` by default (see `vite.config.ts`); `vite --mode vercel` points
   the proxy at `localhost:3000` for a local `vercel dev` instead.

## Data models / schemas

Nearly all product data lives in **Firestore** (no schema file in this repo — collections are
implicit in the code that reads/writes them). Confirmed collections/paths referenced in `src/`
and `api/`:

- `users/{uid}` — `{ role: "ADMIN"|"EDUCATOR"|"STUDENT", isEmployee?, orgUid?, employeeDocId?, ... }`
- `educators/{educatorUid}` — the org/tenant document: `builderConfig.themeKey`, `maxBatches`,
  `allowedSubjectIds[]`, `allowedCourseIds[]`, `seatLimit`, `features.chatbot`, `chatCreditCap`,
  `aiCreditLimit`, `aiCommissionMultiplier`, tenant branding/config
- `educators/{uid}/employees/{empUid}` — `{ uid, email, name, roleId, status: PENDING|ACTIVE|DEACTIVATED, scope.branchIds[] }`
- `educators/{uid}/branches/{branchId}/courses/{courseId}/content/{contentId}` — per-course content
- `educators/{uid}/branches/{bid}/courses/{cid}/modules/{moduleId}/lessons/{lessonId}` — curriculum
- `.../batches/{batchId}/timetable/{slotId}` — recurring weekly class slots
- `.../batches/{batchId}/sessions/{sessionId}` — attendance sessions
- `educators/{uid}/students/{studentId}/manualGrades/{gradeId}` and `.../lessonProgress/{lessonId}`
- `educators/{uid}/batchAssignments/{id}` — test-to-batch scheduling/access-code config
- `educators/{uid}/my_tests/{testId}` — test series documents (includes DPPs and personalized
  practice tests, discriminated by a `type` field)
- `educators/{uid}/aiUsage/{YYYY-MM}` — monthly AI credit usage
- `roles/{roleId}` — global RBAC role templates (`name, description, permissions[], status`)
- `courses/{id}`, `subjects/{id}` — global catalog collections
- `admin_library/{contentId}` — admin-uploaded books/notes
- `examResults/{examId}_{studentId}` — **added in the portal revamp**
  (`src/shared/lib/examModel.ts`): one doc per curriculum-exam-and-student, holding
  `examId, educatorId, studentId, studentName, courseName, marks, maxMarks, rank?,
totalStudents?, updatedAt, createdAt`. Top-level (not nested under the student) so a
  cross-student query (for ranking) is possible at all; written by the educator
  (`ExamSchedule.tsx`'s "Record marks"/"Release results"), read by the owner dashboard, the
  report card and the educator's own Firestore queries. Rank is computed exam-wide (every
  student who sat that exam, across every target batch), not per batch. **Has no Firestore
  security rule yet** — see `docs/agents/risks.md`.

**Note on `firestore.rules`**: this repo has no `firestore.rules` file — security rules are
managed entirely outside this codebase. A change here that assumes a rule exists (e.g. a new
student-writable subcollection, or the new `examResults` collection above) needs a human to also
update rules elsewhere; verify, don't assume. (See `CLAUDE.md`'s note on the one known rule, for
student `lessonProgress`.)

No Postgres/SQL schema lives in this repo (`grade-engine` and `monkey-king` own their own
Postgres schemas in their own repos; this repo's question-bank data syncs from `qbank-scraper`
via monkey-king, per sibling docs — not independently verified here).

## External services and SDKs

| Service                                     | Used for                                                                                                               | Where                                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase Auth                               | Login, ID tokens                                                                                                       | `src/shared/lib/firebase.ts`, `api/_lib/requireUser.ts`                                                                                                    |
| Firestore                                   | Primary datastore                                                                                                      | throughout `src/features/*`, `src/shared/lib/*`                                                                                                            |
| Firebase Admin SDK                          | Server-side Firestore/Auth writes                                                                                      | `api/_lib/firebaseAdmin.ts`, most of `api/*`                                                                                                               |
| Google Vertex AI (`@google-cloud/vertexai`) | Gemini model calls for AI question import, subjective evaluation                                                       | `api/_lib/parseAiJson.ts`, `api/ai/*.ts` — uses the Firebase service account credentials, **not** a `GEMINI_API_KEY` (that var is retired per `CLAUDE.md`) |
| ImageKit                                    | File/content uploads                                                                                                   | `api/imagekit-auth.ts`, `src/shared/lib/imagekitUpload.ts`                                                                                                 |
| Razorpay                                    | Legacy seat billing                                                                                                    | `api/_lib/razorpayRequest.ts` — **currently unused** (no importer found; see risks.md)                                                                     |
| Discord webhook                             | Error logging                                                                                                          | `api/_lib/discordLogger.ts`                                                                                                                                |
| monkey-king (own repo)                      | Payments (Cashfree), coupons, invites, RBAC enforcement, chatbot/RAG, DPP generation, analytics, personalized practice | called directly from the browser and from a couple of `api/*` functions                                                                                    |
| grade-engine (own repo)                     | AI-graded offline exam scanning                                                                                        | called directly from the browser                                                                                                                           |
| spider-desktop (own repo, local)            | Proctored desktop exam handoff                                                                                         | `localhost:41337` ping + custom URL scheme                                                                                                                 |

## Env vars / config (names only)

Client (`VITE_*`, baked into the build, **not secret** — see risks.md for one exception):
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_FIREBASE_MEASUREMENT_ID`, `VITE_GRADE_ENGINE_API_URL`, `VITE_MONKEY_KING_API_URL`,
`VITE_MONKEY_KING_ADMIN_KEY` (sent as a Bearer token to monkey-king admin endpoints from the
admin panel — see risks.md, this is not actually safe to treat as non-secret),
`VITE_APP_DOMAINS`, `VITE_APP_DOMAIN`, `VITE_APP_BASE_DOMAIN`, `VITE_ALLOW_QUERY_TENANT_FALLBACK`,
`VITE_RESERVED_SUBDOMAINS`, `VITE_THEME_*` (per-theme overrides), `VITE_IMAGEKIT_PUBLIC_KEY`,
`VITE_DISCORD_ERROR_WEBHOOK_URL`, `VITE_AI_PDF_IMPORT_ENABLED`,
`VITE_AI_WEBSITE_CONTENT_ENABLED`, `VITE_AI_PERFORMANCE_ANALYSIS_ENABLED`,
`VITE_AI_SUBJECTIVE_EVALUATION_ENABLED` (client-side feature flags).

Server (Vercel function env, real secrets — set in the Vercel dashboard, never committed):
`FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, `FIREBASE_STORAGE_BUCKET`,
`VERTEX_LOCATION` (default `us-central1`), `GEMINI_MODEL`, `IMAGEKIT_PUBLIC_KEY`,
`IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`DISCORD_ERROR_WEBHOOK_URL`, `ADMIN_MAX_FILE_SIZE_MB`, `EDUCATOR_MAX_FILE_SIZE_MB`,
`CORS_ALLOW_ORIGINS`, `CORS_ALLOW_DOMAIN_SUFFIXES`.
No `.env.example` exists in this repo (confirmed: not present) — this list was built from
`grep`ing `process.env.`/`import.meta.env.` call sites, not from a documented template. Treat
any var not listed here as unverified before relying on it.

## Entry points

- `src/main.tsx` — app bootstrap (React root, error boundary, global error/rejection logging to
  `errorLogger.ts`).
- `src/App.tsx` — providers (Auth, Tenant, React Query) + `AppRoutes`.
- `src/AppRoutes.tsx` — tenant-vs-main-domain routing split.
- `vite.config.ts` — dev server (`:8080`), `/api` proxy target, path aliases.
- `api/<name>.ts` / `api/<dir>/<name>.ts` — one Vercel serverless function per file; each exports
  a default `(req, res)` handler.
- `vercel.json` — routing rules for the Vercel deployment, including a catch-all SPA fallback to
  `index.html` and a handful of `/api/orders/*`, `/api/admin/assign-pickup` rewrites that proxy
  to `drippr-seller-serverless.vercel.app` — **unrelated to this product** (Drippr looks like a
  different project's checkout/seller API); see `docs/agents/risks.md` before touching
  `vercel.json`.
