# univ-live-new — Codebase Context

## What This Is

Multi-tenant SaaS platform for coaching institutes. Built with React + TypeScript + Vite + Tailwind + shadcn/ui. Deployed on Vercel.

## Architecture

### Domains

- **Main domain** (`univlive.tech` / `localhost:8080`): marketing site + admin panel
- **Tenant subdomains** (`{slug}.univlive.tech`): educator portal + student portal

### Auth & Roles

- Firebase Auth for login; Firebase Firestore for user data
- Three roles: `ADMIN`, `EDUCATOR`, `STUDENT`
- Role stored in Firestore `users/{uid}.role`, also resolved from token claims
- `RequireRole` component guards routes; admin routes use `redirectTo="/admin/login"`
- `StudentRoute` checks `profile.enrolledTenants` or `profile.tenantSlug`

### API Layer

- Serverless functions in `api/` (TypeScript, deployed as Vercel functions)
- Dev proxy: `vite.config.ts` → `vite dev` proxies `/api` to `https://www.univlive.tech`
- To proxy to local vercel dev instead: `vite dev --mode vercel` (targets `localhost:3000`)

### Backend (separate repo)

- `monkey-king` Python FastAPI backend handles payments, coupons, educator/student mgmt
- Runs on `localhost:8000` in dev; deployed separately

## Key Files

| File                                       | Purpose                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `src/AppRoutes.tsx`                        | Central routing; tenant vs main domain split                           |
| `src/app/routes/`                          | Modular route files (admin, educator, student, public)                 |
| `src/app/providers/`                       | AuthProvider, TenantProvider (contexts)                                |
| `src/shared/auth/RequireRole.tsx`          | Route-level role guard                                                 |
| `src/shared/routes/StudentRoute.tsx`       | Student route protection                                               |
| `src/shared/lib/studentRegistration.ts`    | POST `/api/tenant/register-student` on login                           |
| `src/shared/lib/firebase.ts`               | Firebase client init                                                   |
| `src/shared/services/`                     | Auth service, tenant service                                           |
| `src/shared/ui/MultiSelect.tsx`            | Generic multi-select dropdown (options prop, no Firestore fetch)       |
| `src/shared/hooks/useAccessibleCourses.ts` | Educator-scoped courses+subjects from allowedSubjectIds                |
| `src/features/educator/`                   | All educator portal pages + components                                 |
| `src/features/student/`                    | All student portal pages + components + types                          |
| `src/features/admin/`                      | All admin panel pages + components                                     |
| `api/_lib/`                                | Shared Vercel function utils (Firebase admin, Gemini, Discord logging) |
| `api/tenant/`                              | Tenant slug lookup, student registration                               |
| `api/billing/`                             | Seat assign/revoke (billing status only, not enrollment)               |
| `api/ai/`                                  | AI performance analysis, question import                               |
| `vite.config.ts`                           | Dev server + proxy config                                              |
| `vercel.json`                              | Vercel routing rules                                                   |

## Pages

### Main Domain

- `/` — marketing landing page
- `/admin` → `/admin/login` → admin dashboard (revenue, educators, students, tests taken, active trials)
- `/admin/analytics` — platform activity: 7-day attempts chart, today's engagement, recent activity feed
- `/admin/educators` — educator management (create educators here)
- `/admin/plans`, `/admin/coupons`, `/admin/payment-logs`, `/admin/seats`, `/admin/subjects`
- `/admin/roles` — Employee Roles management: create/edit/archive roles with permission checkboxes; "Seed Defaults" button creates 5 built-in role templates from `rolesConfig.ts`; roles are org-wide and assigned to employees by educator admins
- `/admin/content` — Admin content library (books/notes per subject)
- No `/login` or `/signup` on main domain (intentional)

### Tenant Domain

- `/login` — educator + student login
- `/signup` — student signup via invite token
- `/educator/*` — educator portal (dashboard, learners, billing, tests, content, etc.)
- `/educator/dashboard` — focused: students count, live tests, avg score, active codes; quick actions
- `/educator/analytics` — deep analytics: student growth, attempts chart, top performers, subject heatmap (existing Analytics.tsx, now routed)
- `/educator/question-papers` — submit question paper files to admin for manual upload; shows status (PENDING/IN_PROGRESS/COMPLETE/CANCELLED); can edit/cancel while PENDING
- `/educator/content` — per-course content management; import from admin library
- `/educator/organization` — Branches, Programs, and **Employees** tabs; employees tab: invite staff, assign role + branch scope, filter list
- `/student/*` — student portal (dashboard, tests, results, rankings, content)
- `/student/dashboard` — live tests grid, resume in-progress, rank + avg score, leaderboard preview (top 5), score trend
- `/student/reports` — performance analytics: readiness score, weak areas, strong holds, strategy list, subject accuracy bar chart, weekly trend line chart; calls `monkey-king GET /api/reports/my` (STUDENT auth via Firebase ID token); Refresh button calls `POST /api/reports/recompute` (202, rate-limited 10 min); subject filter + "Show all" toggle over the now-uncapped `weak_areas_full`/`strong_holds_full`; "Practice this" per weak-area row → `/student/practice`
- `/student/practice` — Personalized Practice Generator (new, master_revamped); Auto (from weak areas) / Custom mode toggle, question-count slider; calls `monkey-king GET/POST /api/test/personalized/*`; on generate, redirects straight into `StudentCBTAttempt` (`/student/tests/:testId/attempt`) — no separate detail step
- `/student/content` — view books/notes for enrolled course

## Employee RBAC System

- **Config**: `src/shared/lib/rolesConfig.ts` — single source of truth; exports `PERMISSIONS`, `PERMISSION_LABELS`, `PERMISSION_GROUPS`, `DEFAULT_ROLES` (5 built-in templates); `employeePermissions.ts` is now a re-export shim pointing here
- **Roles**: defined by platform admin at `roles/{roleId}` (global Firestore collection); fields: `name, description, permissions[], status`; seeded from `DEFAULT_ROLES` via "Seed Defaults" button in admin panel
- **Permissions**: 17 atomic permissions (e.g. `students.view`, `tests.create`, `analytics.view`, `dpps.manage`, `website.manage`)
- **Employees**: stored in `educators/{orgUid}/employees/{empUid}`; fields: `uid, email, name, roleId, status (PENDING|ACTIVE|DEACTIVATED), scope.branchIds[]`
- **Auth**: employees have `role: "EDUCATOR"` in `users/{uid}` plus `isEmployee: true, orgUid, employeeDocId` — also set as Firebase custom claims on invite so backend can check status
- **Context**: `src/shared/contexts/EmployeeContext.tsx` — loads permissions only if `status === "ACTIVE"`; shows spinner while loading; `useEmployee()` gives `hasPermission(p)` and `inBranchScope(branchId)`
- **Sidebar**: `EducatorLayout` filters nav items using `PERMISSIONS` constants; Billing + Organization hidden for employees; Messages gated by `messages.view`; Reported Questions gated by `tests.view`; DPP Generator gated by `dpps.manage`
- **Backend enforcement**: `auth_middleware.get_current_educator` rejects DEACTIVATED employees by reading their Firestore employee doc when `isEmployee` claim is present
- **Invite flow**: org head fills form → `POST /api/org/invite-employee` creates Firebase Auth user + writes Firestore docs + sets custom claims → frontend calls `sendPasswordResetEmail` → employee sets password → logs in

## Multi-Tenant Theming

- `src/themes/coaching/` — theme1, theme2, theme3 for tenant home pages
- Theme selected per tenant in Firestore

## Educator Defaults (on creation)

- `maxBatches: null` — unlimited until admin sets it
- `allowedSubjectIds: []` — no subjects until admin assigns via Division Controls
- `allowedCourseIds: []` — no courses until admin assigns; checking a course auto-adds all its subjects
- `seatLimit: 0` — no seats until purchased

## Payments

- **Cashfree** via `monkey-king` FastAPI backend (replaced Razorpay)
- Educator self-service: `POST /api/payment/initiate` → Cashfree checkout → Cashfree redirects to `pay.preparekaro.in/callback` → back to `/educator/billing?payment=success` → `POST /api/payment/verify/{orderId}`
- `pay.preparekaro.in` is a fixed Cashfree-whitelisted domain; `/callback` route served by the same Vercel deployment; "pay" is a reserved subdomain in `tenant.ts`
- `return_url` is built server-side by `payment_manager.initiate_payment()` using educator's `tenantSlug` — not passed from frontend
- Admin payment link: `POST /api/payment/admin/create-payment-link`
- Cashfree webhook: `POST /api/payment/webhook` (handled by monkey-king, not Vercel)
- `api/razorpay/webhook.ts` — legacy Razorpay handler; kept for existing subscriptions only
- `api/billing/update-quantity.ts` — returns 410 Gone (deprecated Razorpay subscription endpoint)
- Seat billing status (active/inactive per student): `api/billing/assign-seat.ts`, `api/billing/revoke-seat.ts`
- All amounts are in **rupees** (not paise)

## AI Features

- Gemini-powered question import (`api/ai/import-questions`)
- AI performance analysis per student
- AI website content generation for educator profiles

## AI Chatbot (RAG)

- **Route**: `/student/chatbot` — AI Tutor page; 2-step flow: (1) mode + content selection, (2) chat
- **Component**: `src/features/student/StudentChatbot.tsx`
  - Setup screen: mode toggle ("Course content" | "Upload file"), then content checkboxes + topic hint (course mode) OR file upload drop zone (upload mode)
  - Upload mode: student uploads PDF (≤10MB) or image (≤5MB); backend extracts text/describes image; extracted text stored in state and sent as `uploaded_context` per message
  - Chat screen: markdown rendering (react-markdown + remark-gfm/math + rehype-katex), source citations, animated typing indicator, internet toggle in both modes
- **Backend**: `monkey-king /api/chat/*` endpoints (FastAPI)
  - `POST /api/chat/extract-upload` — multipart file upload (STUDENT auth); extracts text from PDF or describes image via Gemini Vision; returns `{ context: str }`
  - `POST /api/chat/message` — `content_ids[]` filters Pinecone (course mode); `uploaded_context` bypasses Pinecone entirely (upload mode); `topic_context` injected into system prompt; returns `contextSources[]`
  - `GET /api/chat/usage` — returns educator's monthly AI credit status (`percentUsed`, `breakdown`, `resetDate`, etc.)
- **AI Credits**: chatbot usage deducts from educator's monthly AI credit pool; no per-student daily limit; educator can set a `chatCreditCap` sub-limit from their Settings page; HTTP 402 returned when credits exhausted

## DPP Auto-Scheduling

- **Route**: `/educator/dpp` — DppGenerator with two views: "Generate Now" + "Schedule"
- **Component**: `src/features/educator/DppGenerator.tsx`
  - Generate Now: source toggle (AI / QB / Hybrid), content/topic picker, difficulty, topic hint
  - Schedule: 3-step wizard — Step 1: Source mode + content/QB filters; Step 2: Template summary + difficulty; Step 3: Date range, time, batches, topic rotation list
  - Topic rotation: round-robin list of topics (replaces per-date dailyTopics map for new schedules)
  - Source modes: `ai_only` (Pinecone+Gemini), `qb_only` (educator QB only), `hybrid` (QB first, AI fills gap)
- **Backend**: `monkey-king /api/dpp/*`
  - DPP template: global only (`dpp_template/default`, admin-managed via `GET/PUT /api/dpp/template`)
  - `POST /api/dpp/generate` — accepts `source_mode`, `topic_filters`, `subject_filter`
  - `POST /api/test/gap-fill` — AI gap-fill for normal test sections when QB is short; questions get `source: "ai_gap_fill"` + `reviewRequired: true`
  - APScheduler job runs every 15 min, auto-generates DPPs for due schedules and publishes to `targetBatches`
  - DPP tests stored in `educators/{uid}/my_tests` with `type: "from_dpp"`; no separate `dpps` collection

## Question Types

- **File**: `src/shared/lib/questionTypes.ts`
- **Types**: `MCQ` | `SHORT_ANSWER` | `UPLOAD` | `CASE_STUDY` (new)
- `CASE_STUDY`: passage + sub-questions (each MCQ/SHORT_ANSWER/UPLOAD); marks per sub-question; `SubQuestion[]` type exported
- `normalizeQuestionType()` maps legacy pipeline values: `single_correct_mcq`→MCQ, `subjective`→SHORT_ANSWER, `case_study`→CASE_STUDY, etc.

## Question Upload (formerly Question Paper Requests)

- **Route**: `/educator/question-papers` — unchanged route; underlying API now `/api/question-upload/` (was `/api/question-paper/`)
- **DB table**: `question_upload_requests` (renamed from `question_paper_requests` in migration 008)
- Both `/api/question-upload/*` (canonical) and `/api/question-paper/*` (compat alias) are active

## Exam Grading (offline paper exams, AI-graded)

- **Backend**: `grade-engine` (separate FastAPI service, own Postgres — not monkey-king), called **directly** by this app (not proxied). Env: `VITE_GRADE_ENGINE_API_URL`. Same Firebase project as monkey-king, so the same ID token works on both.
- **Educator routes**: `/educator/exam-grading` (list/create exams), `/educator/exam-grading/:examId` (questions + question paper/answer key upload + per-student answer sheets), `/educator/exam-grading/:examId/review/:sheetId` (per-question review/override — adapted from `SubjectiveAttemptGrader.tsx`'s two-column student-answer/reference pattern)
  - **Components**: `src/features/educator/examGrading/{ExamGradingList,ExamGradingDetail,ExamGradingReview}.tsx`, API client `src/features/educator/examGrading/api.ts`
  - Question paper / answer key / student answer sheet uploads all accept multiple page images OR a single PDF via `src/shared/components/MultiFileDropzone.tsx` — two capture paths side by side: "Choose Files" (gallery/file picker, replaces selection) and "Take Photo" (`capture="environment"` input, opens the device camera directly on mobile, one photo per tap, appends so a teacher can shoot a multi-page sheet page by page without leaving the app)
  - "Add Student" picks from monkey-king's roster (`GET monkey-king /api/org/students`, optional branch/course/batch filters) to set `student_uid`, or falls back to a free-text name if the roster call fails
  - **"Extract from Photos"** button (Questions card header, `ExamGradingDetail.tsx`) calls grade-engine's `POST /api/exams/{examId}/question-paper/extract` (`extractQuestionsFromPaper` in `api.ts`) — reads the already-uploaded QP photos with Gemini and full-replaces `exam_questions` with derived question_no/max_marks/marking_scheme, same response shape as `setQuestions`. Disabled (with a tooltip) until at least one QP page is uploaded. Exists because grading previously had a silent gap: QP photos alone never populated `exam_questions`, so a sheet could be graded `0/0` with nothing to grade against.
  - **"Start Grading" is disabled (with a tooltip) when `questions.length === 0`** — mirrors grade-engine's own backend guard (`POST .../start` 400s with the same "no questions configured" condition), so the educator sees why before clicking instead of only via an error toast after.
  - **"Review" is disabled (with a tooltip) for `status === "pending"`** — pending means grade-engine's poller hasn't claimed the sheet yet (Pass 1 hasn't run), so the review page is guaranteed to have zero graded questions. Stays clickable for `processing` (Pass 2 writes each question's grade as it completes, so a partial view is real) and `graded`. `ExamGradingReview.tsx`'s empty state is also status-aware now (queued / in-progress / failed / generic) instead of one generic message.
  - **`ExamGradingReview.tsx` question cards are collapsible** — header (verdict badge, question no., marks, approved badge) always visible; body (answer image, step breakdown, feedback, override form) collapses via `@shared/ui/collapsible`, default collapsed, with an Expand All/Collapse All toggle next to the sheet total. Added because a full exam's worth of tall stitched answer images (see below) made the page unscannable at a glance.
- **Student routes**: `/student/exam-results` (list), `/student/exam-results/:sheetId` (detail — read-only version of the review card layout)
  - **Components**: `src/features/student/examResults/{StudentExamResultsList,StudentExamResultDetail}.tsx`, API client `src/features/student/examResults/api.ts`
- Grading data shape (from grade-engine): each graded question has `question_text` (nullable, shown as a line under the question heading on both the review and result-detail cards), `marks_awarded`/`max_marks`, `annotated_image_url` (cropped answer image with wrong-content highlighted), and `annotation_json.steps[]` (per-step title/marks/note) — the step-by-step breakdown panel. Gradings arrive pre-sorted by the paper's actual question order (grade-engine joins on `exam_questions.sort_order` server-side) — do not re-sort by `question_no` client-side, it's free text and sorts lexicographically wrong (1, 10, 11, 2...).
- The answer-image container (`ExamGradingReview.tsx`/`StudentExamResultDetail.tsx`) is `max-h-[720px] overflow-y-auto` with the `<img>` at plain `w-full` (no height cap/`object-contain`) — questions whose answer spans multiple sheet pages get vertically stitched by grade-engine into one tall, narrow image (`image_manager.build_answer_image`), and a height-capped `object-contain` box used to squash those down to near-illegible size; the scrollable container lets them render at full width instead.
- Answer sheet `status` now includes `pending` (queued, not yet claimed by grade-engine's grading poller) between `uploaded` and `processing` — grade-engine's `/start` no longer runs the pipeline synchronously in-thread, it queues a DB row a poller picks up within a few seconds. `STATUS_CLASS` maps it to an amber badge in both `ExamGradingDetail.tsx` and `StudentExamResultsList.tsx`; the "Review" link condition and `handleStartGrading`'s optimistic update were updated to include it.

## Content Management

- **Firestore**: `admin_library/{contentId}` — admin-uploaded books/notes scoped by subject
- **Firestore**: `educators/{uid}/branches/{branchId}/courses/{courseId}/content/{contentId}` — per-course content
- Educators see only admin library items where `subjectId in allowedSubjectIds`
- Students read course content via their `educatorId + branchId + courseId` from profile
- File uploads use ImageKit scope `"content"` (`api/imagekit-auth.ts`)
- `src/lib/imagekitUpload.ts` exports `getContentUploadLimit()` to fetch per-role MB limit

## Environment Variables

- `VITE_FIREBASE_*` — Firebase client config
- `VITE_GRADE_ENGINE_API_URL` — grade-engine (exam paper grading) backend URL, called directly from the client (see Exam Grading section)
- Vercel functions use `FIREBASE_SERVICE_ACCOUNT_JSON` (base64 or raw JSON), `DISCORD_WEBHOOK_URL`, `VITE_MONKEY_KING_API_URL` (for report-usage calls), `VERTEX_LOCATION` (default `us-central1`); `GEMINI_API_KEY` no longer used — replaced by Vertex AI via service account
- `RAZORPAY_WEBHOOK_SECRET` — still needed for legacy Razorpay webhook handler
- `ADMIN_MAX_FILE_SIZE_MB` — max upload size for admin content (default 100)
- `EDUCATOR_MAX_FILE_SIZE_MB` — max upload size for educator content (default 20)

## AI Credits System

- **Educator view**: `Billing.tsx` — AI Credits gauge at top (% used, feature breakdown, warning at ≥80%, red at 100%); resets on 1st of each month
- **Educator settings**: `Settings.tsx` → `AiTutorSettings` component — toggle chatbot on/off (`features.chatbot`), set optional `chatCreditCap` (max credits chatbot can consume from monthly pool)
- **Admin view**: `SeatManagement.tsx` AI Credits card — set `aiCreditLimit` (monthly units), optional per-educator `aiCommissionMultiplier`, live usage bar with feature breakdown
- **Firestore**: `educators/{uid}/aiUsage/{YYYY-MM}` — subscribed to in both Billing and SeatManagement for live updates
- **HTTP 402**: all AI features return `{ error: "ai_credits_exhausted", message: "...", percentUsed: float }` when limit hit; handle in each feature component with a user-facing message
- **Vercel → backend**: `evaluate-subjective.ts` and `import-test-questions.ts` call `POST /api/ai/report-usage` on monkey-king after each successful AI call (non-blocking, passes educator's Firebase ID token via `Authorization` header forwarded from frontend)

## Filter System (Question Bank / Templates / Test Bank)

- **Cascade**: Course (single) → Subject (multi) → Chapter (single, QB only) → Topic (multi, QB only) → Tags (multi, QB only)
- **Courses**: `courses` collection `{id, name, isActive}` — admin sees all; educator sees only those derived from their `allowedSubjectIds` via `useAccessibleCourses`
- **Subjects**: `subjects` collection `{id, name, courseId}` — filtered by selected course; educator only sees allowed subjects
- **Chapter**: free-text field (`chapter`) on questions — single string, derived dynamically after subject filter; narrows topic options
- **Topics/Tags**: free-text fields on questions (`topic`, `topics[]`, `tags[]`) — derived dynamically from filtered question pool (after chapter filter)
- **CSV import validation**: validates `course` and `subject` column values against Firestore before writing; throws with list of invalid rows + valid options
- **SectionCard (template editor)**: topics/tags per-section driven by question bank data passed from `CreateTemplateModal`
- **Educator bankTests**: pre-filtered in TestSeries to only show templates whose `courseId` is in educator's accessible courses

## Batch Schedule Panel

- **Trigger**: "Schedule" button on each batch card in `/educator/batches`
- **Component**: `src/features/educator/components/BatchSchedulePanel.tsx`
  - Sheet (right slide-in) per batch — no route change
  - Tabs: Upcoming | Past | Access Codes
  - Upcoming/Past: tests from `my_tests` where `targetBatches array-contains batchId`
  - Access Codes: codes from `accessCodes` where `testSeriesId` in batch's test IDs
  - "Assign Test" button → `AssignAndScheduleDialog` → creates `educators/{uid}/batchAssignments/{id}` doc
  - "Remove from Batch" → `deleteDoc` on `batchAssignments/{id}` + `arrayRemove(batchId)` from `my_tests/{testId}.targetBatches`
  - Edit/delete access codes inline — no need to navigate to `/educator/access-codes`
- **`batchAssignment` doc schema** (`educators/{uid}/batchAssignments/{id}`):
  - `testId`, `testTitle`, `batchId`, `batchName`
  - `accessType`: `"scheduled" | "access_code"`
  - `startTime`, `endTime`, `isScheduleActive` (scheduled type)
  - `accessCode`, `maxUses`, `expiresAt`, `windowMinutes` (access_code type)
  - `attemptsAllowed`
  - `examMode`: `"web" | "desktop" | "both"` — controls whether students use web or desktop app
  - `proctoringConfig`: `{ faceDetection, phoneDetection, eyeGaze, photoCapture, violationThreshold }` — null when examMode is "web"
  - `createdAt`, `updatedAt`
- **Assignment config is per-batch**: same test can be desktop-only for one batch and web-only for another
- **StudentTestDetails** reads `examMode` from `batchAssignment`; shows "Open in Desktop App" / "Take on Web" / both buttons accordingly
- **BatchesListing enhancements**:
  - Batch card now subscribes to `my_tests` to compute per-batch live test counts
  - "N live" green badge on Schedule button when tests are active now
  - Buttons restructured: [Invite] [Schedule] row + [Students] [icon buttons] row
- **ScheduledAssessmentsList enhancement**:
  - Shows actual batch names (resolved from IDs) instead of "N Batch(es) assigned"
  - "Manage by Batch" shortcut button → `/educator/batches`

## Personalized Practice Generator (master_revamped)

- **Route**: `/student/practice` — `src/features/student/PracticeGenerator.tsx`; API client `src/features/student/practice/api.ts` (mirrors `examResults/api.ts`'s fetch pattern, `VITE_MONKEY_KING_API_URL` + Firebase ID token)
- **Backend**: `monkey-king /api/test/personalized/*` — `GET /filters` (distinct subject/chapter/topic tree + current weak areas), `POST /generate` (`{mode, subject?, chapters?, topics?, difficulty?, question_count}` → `{testId}`)
- No LLM involved — monkey-king's `personalized_test_manager.py` does a plain weighted allocation across the student's weak (subject, chapter, topic) nodes and samples from a Postgres question pool (synced from `qbank-scraper`, see monkey-king's CLAUDE.md)
- Generated tests are normal `educators/{uid}/my_tests/{testId}` docs (`type: "personalized"`, `visibility: "private"`) under the _student's own_ educator — reuses `StudentCBTAttempt` and the whole existing attempt/scoring/report pipeline. Excluded from `StudentTests.tsx`'s grid and `TestSeries.tsx`'s educator listing via a `type !== "personalized"` filter.

## Workspace Split — LMS vs Test Platform (master_revamped)

- Nav-only reorganization, no route renames (preserves bookmarks, batchAssignment links, and the `spider-desktop` deep link which references `testId`/`assignmentId`, not paths).
- **Educator** (`EducatorLayout.tsx`): a two-way segmented switcher ("LMS" / "Test Platform") above the sidebar nav, persisted in `localStorage` (`pk_educator_workspace`), defaulted from the current pathname on first load. `sidebarItems` entries carry an optional `workspace: "lms" | "test" | "both"` tag; `visibleSidebarItems` filters by the active workspace. LMS: Dashboard, Batches, Students. Test Platform: Objective Exams (+children), Subjective Exams. Analytics is tagged `"both"` (mixes growth and attempt metrics). Organization/Billing/Settings remain in the profile dropdown, unaffected by the switcher.
- **Student** (`StudentLayout.tsx`): same pattern, "My Course" / "Test Platform" switcher (`pk_student_workspace`). My Course: Dashboard, Content, AI Tutor. Test Platform: Tests, My Results, Reports, Practice for Me, Rankings.
- No Attendance/Grades modules built in this pass (confirmed absent from the codebase before this change) — deferred.

## Desktop Exam Integration (spider-desktop)

- When `examMode === "desktop"` or `"both"`, student sees "Open in Desktop App" button in `StudentTestDetails`
- App detection: `fetch("http://localhost:41337/ping")` — spider-desktop runs a ping server on that port
- Deep link: `preparekaro://launch?testId=X&tenantSlug=Y&idToken=Z&assignmentId=A`
- `assignmentId` is the `batchAssignment` doc ID — spider-desktop uses it to load `proctoringConfig`
- Proctoring report viewable at `/educator/proctoring/:attemptId`
- New educator routes: `GET /api/exam/proctoring/{attemptId}` in monkey-king

## Dev Commands

```bash
bun run dev          # start dev server on :8080
bun run build        # production build
bun run lint
```

---

_Keep this file updated whenever routes, roles, major components, or architecture changes._
