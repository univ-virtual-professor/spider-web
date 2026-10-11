# Design

Two coexisting visual systems in this codebase — know which one a screen is in before touching it.

## 1. Default shadcn theme (marketing site, admin panel, public tenant theme pages)

### Colors

Defined as HSL CSS variables in `src/index.css` `:root` (light) and `.dark` (dark mode, class-based
via `tailwind.config.ts`'s `darkMode: ["class"]`), consumed through `tailwind.config.ts`'s
`theme.extend.colors` (`primary`, `secondary`, `muted`, `accent`, `destructive`, `border`,
`sidebar-*`, etc. — the standard shadcn token set) plus a few bespoke additions:

- `brand.start` / `brand.end` / `brand.blue`, `pastel.{mint,yellow,lavender,cream,peach,pink}`,
  `indigo` / `indigo-light` / `indigo-dark`, `violet` / `violet-light`, `section-1..5`,
  `gray-text` / `gray-light`.
- Gradients/shadows as CSS vars too: `--gradient-primary`, `--gradient-hero`, `--shadow-soft`,
  `--shadow-card`, `--shadow-elevated`.
- Primary brand hue is an indigo→violet gradient (`hsl(245 82% 67%)` → `hsl(263 70% 58%)`).

### Typography

`tailwind.config.ts` `fontFamily`: `sans` = Plus Jakarta Sans (body/UI), `display` = Nunito
(headings/marketing), both with Inter/system-ui fallback. Loaded via `@import` at the top of
`src/index.css`.

### Spacing / radius

`--radius: 1rem` (shadcn's rounded look). Container config: centered, `2rem` padding, extra `xs`
breakpoint at `424px` (`screens.xs`) for small-phone tweaks.

### Where shared components live

`src/shared/ui/` — 53 shadcn/ui primitives (Button, Card, Dialog, Sheet, Table, Tabs, Form,
Sidebar, Toast/Sonner, MultiSelect, Paginator, FloatingInput, etc.). **Reuse these before adding
a new primitive.** Two known issues:

- `components.json` (shadcn CLI config) still points `ui`/`components`/`hooks` aliases at
  `@/components/ui`, `@/components`, `@/hooks` — the pre-migration layout. The actual code lives
  at `src/shared/ui/`, `src/shared/hooks/` (per `REPO_STRUCTURE.md`'s `@shared/*` alias). Running
  `npx shadcn add <component>` with the current config will drop a new file in the wrong place —
  fix the aliases first, or move the generated file manually.
- `src/shared/ui/button_ram.tsx` is dead code (no imports found anywhere in `src/`) — don't treat
  it as a real second button variant; it's a leftover.

Feature-specific composite components live under `src/features/<role>/components/` (or inline
with the page); they compose the `shared/ui` primitives rather than redefining style primitives.
Reusable page-chrome lives in `src/widgets/layout/` (`Navbar`, `LandingNavbar`, `Footer`,
`LandingFooter`, `Layout`, `LandingLayout`, `AnnouncementBar`).

### Layout / navigation

- Public marketing pages (`src/pages/`) use `LandingLayout`/`LandingNavbar`/`LandingFooter`, plus
  `src/pages/landing.css` for page-specific styling outside Tailwind.
- Authenticated portals (`EducatorLayout`, `StudentLayout` — under `src/features/*`) use the
  `ds-*` shell described below: a fixed 236px sidebar + 56px top bar, nav generated per role
  (Owner/Faculty/Ops/Student), not the old Academics/Test-Platform workspace switcher (removed —
  see "Portal shell" below).
- Multi-tenant public home pages are themed per-tenant: `src/themes/coaching/theme{1,2,3}/`,
  `builder/` (visual website-builder output), `shared/` (common theme pieces) — theme choice comes
  from Firestore (`educators/{uid}.builderConfig.themeKey`), not a build-time setting.

### Styling approach

Tailwind utility classes everywhere, `class-variance-authority` for component variants (shadcn
convention), `tailwind-merge`/`clsx` via `src/shared/lib/utils.ts`'s `cn()` helper. Prettier
auto-sorts Tailwind classes (`prettier-plugin-tailwindcss`).

## 2. "ds-*" design system (now the whole educator/student portal)

A second, additive token set and primitive library originally built for a handful of screens and
extended, through the portal revamp (PRs #9-#17, 2026-10-11, `docs/agents/mockups/revamp/`), to
cover the entire authenticated educator and student portal — every route under `EducatorLayout`/
`StudentLayout` now renders inside `.ds-scope`. The marketing site, admin panel and public tenant
theme pages remain on the default shadcn theme (section 1) and are deliberately excluded.
Matches a specific set of mockups ("Edtech Platform UI Mockups" — confirmed in code comments in
`src/index.css` and `src/shared/ui/ds/index.tsx`; `Desktop Portal.dc.html` and the full build
notes are in `docs/agents/mockups/revamp/`, which is the source of truth for the spec — read
`BUILD-NOTES.md` alongside this section).

- **Tokens**: `--ds-ink`, `--ds-accent`, `--ds-info`, `--ds-positive`, `--ds-slate`,
  `--ds-surface`, `--ds-canvas`, `--ds-fill`, `--ds-border` (light + dark variants, `src/index.css`).
  Fonts: `font-ds-sans` (Public Sans), `font-ds-serif` (Source Serif 4, headings), `font-ds-mono`
  (IBM Plex Mono) — see `tailwind.config.ts` `fontFamily`.
- **Activation**: wrapping a subtree in the `.ds-scope` class remaps the _same_ shadcn token names
  (`--primary`, `--background`, etc.) to the ds-* values, so every existing shadcn component
  inside automatically picks up the new look with zero per-component rewrites. Applied at the
  root of `EducatorLayout`/`StudentLayout` — **do not** apply `.ds-scope` to the marketing site,
  admin panel, or public tenant theme pages; they're deliberately excluded.
- **Primitives**: `src/shared/ui/ds/index.tsx` — bespoke components matching the mockup spec
  exactly (fixed pixel font sizes/line-heights, not the default shadcn scale). The file's own
  header comment ("Enrolments, Attendance Overview, Exam Schedule, Website Pages so far") is
  stale — it predates the revamp and understates where this is used; see the per-screen list
  below for the current picture:
  - Screen building blocks: `DsPageHeader`, `DsKpiRow`, `DsStatusPill`, `DsMeter`, `DsCard`,
    `DsCardHeader`, `DsTableHead`/`DsTableRow`, `DsDetailRail`/`DsSplitLayout`, `DsAlertStrip`.
  - Shared states every screen needs (BUILD-NOTES §03) — `DsEmpty` (one primary action),
    `DsSkeletonRows` (real row height, no spinners), `DsInlineError` (inline + retry),
    `DsPermissionNotice` (deep link to an out-of-scope route — wired into
    `src/shared/auth/RequirePermission.tsx`, which renders it in place instead of redirecting),
    `DsFrozenBadge` (read-only records: published exams, released results, submitted attendance).
    Extend this file, don't duplicate its pattern inline, when building another screen or state
    against the same mockups.
- Radius inside `.ds-scope` drops to `0.625rem` (tighter than the app default `1rem`), and
  `box-shadow` utilities are zeroed out (`[class*="shadow-"] { box-shadow: none }`) — the mockup
  look is flat, not elevated.
- **Portal shell** (`EducatorLayout.tsx`/`StudentLayout.tsx`, ticket 1 of the portal revamp —
  `docs/agents/mockups/revamp/BUILD-NOTES.md` §02, screen map in §04): fixed 236px sidebar + 56px
  top bar, both using the `ds-*` tokens (the rest of each screen's own content is unchanged until
  its own revamp ticket — this ticket is shell-only). The top bar shows a `{Role} / {page label}`
  breadcrumb in `font-ds-mono`. Sidebar nav is a flat list (no nested/expandable children),
  generated per role:
  - **Educator roles** — Owner (the org head, not an employee), Faculty (any other educator
    employee), Ops (an employee whose assigned role template is "Front Desk / Ops"). Resolved in
    `EducatorLayoutInner` from `useEmployee()`'s `isEmployee`/`roleName`
    (`EmployeeContext.tsx` now also loads and exposes the role template's `name`).
  - **Student** — always the Student role; `StudentLayout.tsx` doesn't need role resolution.
  - Each layout keeps a flat `navCatalog`/nav-item catalog (icon, label, permission check) keyed
    by href, plus a separate `PRIMARY_NAV_ORDER`/`STUDENT_PRIMARY_NAV` list giving each role's
    primary items in the **exact order of the design's `NAV` constant** (Desktop Portal.dc.html)
    — a flat href list per role, not the catalog's own array order, since Owner/Faculty/Ops each
    order the same underlying items differently. The same permission check (`anyOf`/`ownerOnly`)
    the old sidebar used still applies — an item fails silently out of the list (hidden, not
    disabled) if the viewer can't reach it.
  - Routes that exist but aren't in the current role's design nav (Question Bank, Test Upload
    Request, Reported Questions, Review Answers, Access Codes, Content, the standalone Test
    Platform dashboard, etc. for educators; My Results, Attendance, Grades, Content, AI Tutor,
    Rankings for students) render in a "More" group below the primary nav, so nothing becomes
    unreachable.
  - The design's "Live test" nav item has no standalone route (only reachable with a `testId`
    from Tests & results) and isn't a sidebar entry for that reason. Likewise "Create test"
    (Faculty) has no standalone screen in this codebase — it's a dialog (`CreateCustomTest`)
    reached from the "Tests & grading" page — so it isn't a separate nav entry either, to avoid
    two sidebar links to the same page.
  - **Nav-to-route decisions that needed resolving against what the merged revamp actually built**
    (code review on ticket `2de7447f`, since more than one existing route could plausibly serve a
    given design screen):
    - Faculty's **"Tests & grading"** points at `/educator/exam-grading` (`ExamGradingList`,
      where the merged revamp built that screen — list of exams by state, matches BUILD-NOTES
      §04's "test list by state + live grading run"), not the older `/educator/test-series` page.
      `/educator/test-series` stays reachable from "More" as **"Test series"**.
    - **"Sheet review"** isn't a sidebar entry at all — like "Live test", it's a drill-down
      (`/educator/exam-grading/:examId/review/:sheetId`), not a top-level screen.
    - Faculty's **"Daily practice"** points at `/educator/scheduled-dpps` (`ScheduledDpps` — the
      scheduled-DPP list, previously unreachable from any nav). The DPP **generator**
      (`/educator/dpp`, `DppGenerator`) stays reachable from "More" as **"DPP generator"**.
    - Faculty's and Ops's **"Students"** point at `/educator/students` (`StudentsListing`, the
      real student directory). `/educator/learners` (`Learners.tsx`, the seat/invite screen)
      moves to "More" as **"Invite students"**.
    - **Owner's call**: "Student analysis" is dropped from Faculty's primary nav — in the design
      it's per-student (an Analysis tab on that student's own detail page), not a standalone list
      Faculty has today. `/educator/analytics` stays reachable from "More" as **"Analytics"** for
      any role that can see it.
  - Every nav-catalog item carries a readable default `label` (never the raw href) plus an
    optional per-role `roleLabel` override used only when that item is primary for a role and the
    design calls it something more specific there. The two Attendance routes disambiguate this
    way: default labels are **"Attendance (mark)"** (`/educator/attendance`) and **"Attendance
    overview"** (`/educator/attendance-overview`), with `roleLabel` overriding to the design's
    plain "Attendance" only when each is primary (Faculty, Ops respectively) — so if one ever
    shows up in the other's "More" group, it reads unambiguously.
  - **Removed**: the Academics/Test-Platform workspace switcher, `EducatorWorkspaceContext.tsx`/
    `StudentWorkspaceContext.tsx`, and their `pk_educator_workspace`/`pk_student_workspace`
    `localStorage` keys. Nothing else depended on them.

### Rebuilt screens (tickets 2-8, PRs #9-#17)

Each screen below now renders inside `.ds-scope` using the primitives above; only what's
distinctive per screen is noted — see `docs/agents/mockups/revamp/BUILD-NOTES.md` §04 for the
full screen map and §05 for the numbered business rules referenced below.

- **Tests & grading / Sheet review** (`ExamGradingList.tsx`, `ExamGradingReview.tsx`): a test
  list by grading state plus a live AI-grading run view; the sheet viewer drives a rubric rail
  that writes mark overrides **per rubric step** (rule #4), not per question — wired to
  grade-engine's per-step endpoints (`GET /answer-sheets/:id/steps`, `POST /steps/:id/override`).
  Interim local empty/loading states from early in the revamp were deleted in favor of the shared
  `Ds*` components once those existed.
- **Create test** (`CreateCustomTest` dialog, reached from Tests & grading — no standalone
  route) and **Daily practice** (`ScheduledDpps.tsx`): question editor (MCQ, multi-select,
  numeric, subjective, case) and nightly-generation rules with a "tonight's preview" + approve
  step.
- **Analysis** (`AnalysisView.tsx`, shared faculty/student component), **Students**
  (`StudentsListing.tsx`) and **Batches** (`BatchesListing.tsx`): Analysis is per subject/topic
  accuracy and error mix; Students is sorted by weakness and pulls weakest-topics/at-risk data
  from monkey-king's batch-scoped report endpoints (see `docs/agents/risks.md`); Batches shows
  curriculum progress and status per batch but intentionally has no per-batch average score (no
  `batchId` on `attempts` docs — see risks.md).
- **Student practice player and live test player** (both inside `StudentCBTAttempt.tsx`,
  `/student/tests/:testId/attempt`, branching on the test's `type`): practice chrome
  (`PracticePlayerView.tsx`) adds submit-without-advancing, skip, a worked-solution disclosure, a
  question-dot nav, a running score and a "why these questions" topic breakdown — no hint button
  (no `hint` field exists anywhere in the data model). The live player was restyled to the ink/
  accent/positive/slate token set and gained a "Submit section" control for multi-section tests;
  all attempt/autosave/scoring/proctoring logic is unchanged.
- **Report card** (`ReportCard.tsx`): a structured term report that shows curriculum exams
  (venue, published syllabus, term-plan place — per rule #1) separately from ad-hoc tests/grades,
  reading curriculum results from the new `examResults` collection and ranks from there too
  (exam-wide rank, not batch-scoped — see risks.md).
- **Owner overview and Faculty today** (`OwnerOverview.tsx`, `FacultyToday.tsx`, both rendered by
  `Dashboard.tsx` as a role dispatcher — Ops has no overview screen and is redirected to its own
  first nav item instead): Owner sees batch outcomes/trend, decisions waiting (unscheduled
  batches, pending employee invites, at-risk exams) and faculty load (weekly timetable minutes
  vs. a documented 30h/week reference); Faculty Today is scoped to the signed-in teacher's own
  timetable slots and surfaces one weak-area alert aggregated from monkey-king's batch report
  endpoint.
- **Gap-filling pass** (ticket 8, PR #17): Faculty Attendance gained a short-attendance list
  (below 75% term-to-date, no "notify parents" action — see risks.md); Student Exams gained a
  printable admit slip once ops assigns a real venue/hall/seat; Ops Timetable's loading/empty
  states moved to the shared `DsSkeletonRows`/`DsEmpty`, with the room/conflict/utilisation gaps
  left undone and documented in a code comment (no room concept in the schema); Staff & access
  shows each employee's last-active time.

## Favicons / site identity (public marketing pages)

`index.html` links `rel="icon"` and `rel="apple-touch-icon"` both to `/logo-compact.png`
(1254×1254 PNG — satisfies the "no SVG-only favicon" rule), and ships `Organization`/
`SoftwareApplication`/`WebSite` JSON-LD with a consistent `PrepareKaro` name. There is **no
`/favicon.ico` at the root** despite `public/favicon.png` and `public/favicon.svg` existing
unused — see `docs/agents/risks.md` before changing icons.

## Home page redesign: candidate directions (ticket acc2f7c7, 2026-10-10)

Brief: the root landing page (`src/pages/Index.tsx`) should present PrepareKaro as a full
platform, not only AI answer-sheet checking: topic-level student analysis, personalised practice
papers, test generation from chosen chapters/topics, AI checking, and the Academics/Test Platform
features. Mockups (local only): `docs/agents/mockups/acc2f7c7/direction-<n>.html`. All three keep
the brand navy/blue, the owl mark, "Book a demo" as the primary CTA, and the existing 95%+ and
72-hour claims (no new statistics). Not yet chosen; the approved one is recorded below by `jojo approve`.

- **Direction 1, Follow one student.** White page, brand navy `#14194A`, blue `#1C64F2`, mist
  `#F3F6FB`, accuracy scale weak `#E5484D` / mixed `#E8962E` / strong `#23995F`. Type:
  Bricolage Grotesque (headings, 700–800, tight tracking) and Instrument Sans (body). Hero is a
  live student panel (readiness score, topic accuracy bars that fill once on load). A navy band
  explains the 4-step loop (test, AI checks, weak spots, practice), then alternating
  copy/product-card sections for analysis, personalised papers, test builder and AI checking,
  then Academics vs Test Platform as two definition lists.
- **Direction 2, On paper.** Desk-blue page `#EDF1F7` with white "sheets"; ink `#1B2A55`, red
  pen `#CC2F2B`, highlighter `#FFE45C`, ruled lines `#D8E3F3`, margin line `#F1B9B7`. Type:
  Literata (serif headings), Atkinson Hyperlegible (body; note its slashed zero), Kalam for
  red-pen annotations only. Hero is a personalised question paper on ruled paper with red-pen
  margin notes. Reports as a marksheet with circled weak scores, the builder as a ticked
  syllabus checklist, other features as a ruled index sheet.
- **Direction 3, Institute command.** Full-bleed brand blue `#1C5CE6` hero, sun-yellow CTAs
  `#FFC93C`, ink `#101540`, canvas `#F5F7FC`. Type: Sora (headings) and Hanken Grotesk (body).
  Hero ends in an app window with a working Academics / Test Platform switch. Then a
  three-column "Owners / Teachers / Students" section, a mosaic of four capability tiles of
  different sizes (analysis largest, practice in navy), an 8-item feature grid, blue CTA band.

## Approved direction (ticket acc2f7c7)

Direction 4 chosen. 4 Build direction-4.html as the new root landing page (src/pages/Index.tsx), in today's PrepareKaro style: navy #08183A, blue #0066FF, Plus Jakarta Sans headings + Inter body, pill badges, pastel tints. Keep the real ai-eval-demo-sheet.png demo, the YouTube product tour embed and the existing FAQ from the current page. Hero product card auto-cycles Evaluate/Analyse/Personalise/Build every 5s, stops on click, no auto-cycle under prefers-reduced-motion. Fix the visible gap before full stops in the hero headline (Plus Jakarta Sans 800). Pages to add/update in the same style: (1) rewrite /features as the full-platform hub (it currently covers only AI checking); (2) rewrite /how-it-works as the full loop: test -> AI evaluation -> topic analysis -> personalised practice; (3) add four feature pages, each owning one search intent: /features/ai-answer-sheet-evaluation, /features/student-performance-analysis, /features/personalised-practice-papers, /features/test-generator (tests from chosen chapters/topics, scheduled DPPs). Link them from the home tool cards, /features and the nav/footer; add them to public/sitemap.xml; give each a unique title, description and H1 per web rules. Use only real features and the existing claims (95%+, 5x, 72 hrs, 1,000+); no new statistics. Sample student data is fine. Branch from and target master_revamped only, never master.

### Implemented (ticket acc2f7c7)

- **Shared primitives**: `src/shared/components/landing/LandingPrimitives.tsx` now exports the
  color tokens (`NAVY #08183A`, `ACCENT_500 #0066FF`, `ACCENT_50`/`ACCENT_100` tints) plus
  `Reveal` (scroll-reveal wrapper), `SectionBadge` (pill badge), `SectionHeading` (badge + H2 +
  description, centered) and `TightStop`. These were lifted out of `Index.tsx` (which now
  imports them) specifically so `Features.tsx`, `HowItWorks.tsx` and the four new
  `/features/*` pages can reuse the exact same look instead of re-declaring local copies —
  per this repo's own convention that a component moves to `shared/` once 2+ features need it.
  Any future marketing page in this "today's PrepareKaro style" system should import from here
  rather than redefining these.
- **`Tight`** (and its thin wrapper `TightStop`): Plus Jakarta Sans at weight 800 renders a
  visible gap before narrow punctuation marks — `.` and `,` — immediately followed by a space
  (wide left-side-bearing on those glyphs at that weight). Use `<Tight mark="." />` /
  `<Tight mark="," />` instead of a literal period/comma in any bold/800-weight headline in this
  style system when that mark is followed by `{" "}` (e.g. before a colored `<span>`); it renders
  the mark with a small negative left margin to visually close the gap. `TightStop` is kept as
  `<Tight mark="." />` for existing call sites. Check every H1/H2 in this style system for this
  gap whenever its wording changes — it's easy to reintroduce by typing `,{" "}` or `.{" "}`
  directly instead of using `Tight`.
- **`src/shared/components/landing/FeaturePageLayout.tsx`**: shell for the four dedicated
  `/features/*` pages — `FeaturePageShell` (SEO + `LandingLayout`), `FeaturePageHero` (badge +
  H1 + lede), `FeatureBulletList` (2-column icon/title/description grid), `FeaturePageCTA`
  (centered "Book a Demo" link to `/#interest-form`). Only the content differs per page; reuse
  this shell for any future single-feature page in this style rather than hand-rolling the hero
  chrome again.
- **Hero platform-tour card** (`Index.tsx`'s `PlatformTourCard`): tabs Evaluate/Analyse/
  Personalise/Build, auto-advances every 5s via `setInterval`, permanently stops once any tab is
  clicked, and never auto-advances when `prefers-reduced-motion: reduce` (checked via
  `window.matchMedia`). The active tab's progress sliver uses the `.tour-progress-bar` CSS
  animation in `landing.css` (5s linear fill), which itself turns into a static full bar under
  reduced motion.
- **New home-page sections**: `ToolsSection` ("One Platform, Four Tools", id `#tools`) — four
  cards (one full-width navy, three pastel-tinted) each linking to one of the four `/features/*`
  pages — and `PlatformSection` ("Everything Else You Need", id `#platform`) — an Academics /
  Test Platform tab switcher plus an "Everywhere" row (branded website, mobile app, roles &
  branches). Both sit between the existing `StatsSection`/`AIEvaluationSection` and
  `ComparisonSection`. The old `ProcessSection` ("From Scanned Copy to Published Result" 5-step
  workflow strip) was removed outright — it duplicated the new `ToolsSection`/`PlatformSection`
  framing and was AI-evaluation-only, which no longer fits a full-platform home page.
  `ComparisonSection`'s heading and `COMPARISON_ROWS` were rewritten from "Manual Grading vs.
  PrepareKaro AI" (evaluation-only rows) to "Manual vs. PrepareKaro" with rows spanning the
  whole loop — Checking copies, Finding weak spots, Practice, Making tests, Consistency — under
  column headers "Manual" / "PrepareKaro" (dropped "Grading"/"AI" from the column labels since
  the comparison now covers more than grading).
- **Grid CSS classes** (`src/pages/landing.css`): `.tools-grid` (reused for the 4-tool grid, the
  platform workspace grid, the "Everywhere" row, and the `/features` hub's grids — 1 column
  under 900px) and `.tour-eval-grid` (the Evaluate tab's two-column sheet/steps layout, 1 column
  under 900px) are the generic reusable grid classes for this style system now; prefer them over
  a new one-off class for another 2–4-column marketing grid.
- **Routing**: the four new pages are flat files directly under `src/pages/` (not a
  `src/pages/features/` subfolder) because this repo's filesystem is case-insensitive (macOS
  APFS) and a `features/` directory collides with the existing `Features.tsx` file. Routes
  live in `src/app/routes/publicRoutes.tsx` under `/features/ai-answer-sheet-evaluation`,
  `/features/student-performance-analysis`, `/features/personalised-practice-papers`,
  `/features/test-generator`.
- **Nav/footer**: `LandingNavbar`'s "Features" nav item is now a hover dropdown (desktop) /
  expandable section (mobile) listing the four feature pages plus "All Features"; `LandingFooter`
  "Features" column links to the same four pages instead of non-navigable label text.
