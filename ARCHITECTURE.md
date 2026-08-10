# Learning Notebook — Architecture & Implementation Plan

> A digital study workspace: a shelf of notebooks, each with hundreds of pages,
> each page an infinite canvas you can write, draw, diagram and paste into —
> autosaved, searchable, and tracked as study progress.

---

## 0. What already exists (verified)

Inspected before planning. The brief assumed more setup than is actually here.

| Assumed by brief | Reality |
| --- | --- |
| Next.js | ✅ `next@16.3.0`, App Router, React `19.2.8`, Turbopack default |
| Tailwind | ✅ v4 via `@tailwindcss/postcss` (CSS-first config, no `tailwind.config.js`) |
| shadcn/ui | ❌ **not installed** — no `components/`, no `lib/utils.ts`, no Radix, no CVA |
| Drizzle + Postgres | ❌ not installed |
| Better Auth | ❌ not installed |

Also on the machine: **PostgreSQL 17** (Homebrew, running). Docker daemon is
down, so we use the local Postgres server rather than a container.

### Next.js 16 specifics that change how we write code

Read from `node_modules/next/dist/docs/` (per `AGENTS.md`), not from memory:

- **`middleware.ts` → `proxy.ts`.** Root-level file, exported function named
  `proxy`, **Node.js runtime only** (edge unsupported). This is where the
  optimistic auth redirect lives.
- **Async request APIs are now hard-required.** `cookies()`, `headers()`,
  `params`, `searchParams` are Promises — sync access was removed in 16.
- **Typegen props helpers** — `PageProps<'/n/[notebookId]'>`,
  `LayoutProps<'/'>`, `RouteContext<'...'>` are globally available
  (the existing `app/layout.tsx` already uses `LayoutProps<"/">`).
- **Turbopack is the default** for `dev` and `build`; no custom webpack config.
- **`cacheComponents` stays off.** This app is user-scoped and fully dynamic;
  enabling it would force a Suspense/`use cache` model we don't need.
- `next dev` writes to `.next/dev`, so dev and build can run concurrently.

---

## 1. The one decision that matters: the canvas engine

Everything else is standard product engineering. The canvas is where a project
like this succeeds or dies, so it gets weighed explicitly.

### Option A — build a custom canvas engine
`perfect-freehand` + `rough.js` + custom hit-testing, transform handles,
marquee select, on-canvas text editing, arrow binding, groups, undo stack.

- ➕ Total control, small bundle, exact notebook feel.
- ➖ Realistically 10k+ LOC to reach *mediocre* quality. Arrow-to-shape binding
  and on-canvas rich text alone are multi-week problems. We would ship a worse
  canvas and call it "custom".

### Option B — embed Excalidraw wholesale
Drop `<Excalidraw />` in a page shell and move on.

- ➕ Free, excellent canvas.
- ➖ This is exactly the "Excalidraw with a sidebar" outcome the brief forbids.

### Option C — **Excalidraw as the engine, our own product on top** ← chosen

Use `@excalidraw/excalidraw@0.18.1` as the *rendering and interaction layer*
only, behind our own adapter, and build the notebook product around it.

Verified compatible: peer deps `react: ^19.0.0`.

What the engine gives us for free (all of brief §3–§6): freehand with pressure
(stylus), shapes, arrows that **bind and re-route** when boxes move, on-canvas
text editing, images, eraser, multi-select, rotate/resize, group/ungroup,
z-order, lock, align, snapping, undo/redo, infinite pan/zoom, clipboard, and
the full keyboard-shortcut set. Its data model — `elements[] + appState + files`
— is already the "structured format that reconstructs the page reliably" the
brief asks for, and it powers future PNG/SVG export (`exportToBlob`,
`exportToSvg`) and eventual collaboration.

What **we** build so it stops feeling like Excalidraw:

1. **Paper, not whiteboard.** A background layer we render ourselves — ruled,
   dotted, grid, or plain — that pans and zooms *with* the canvas by reading
   `scrollX/scrollY/zoom` and writing straight to a DOM ref inside `rAF`
   (no React state, no re-render). Excalidraw's own background is set
   transparent. This is the single biggest "it's a notebook" signal.
2. **Ink presets.** Pencil / Pen / Marker / Highlighter as first-class tools —
   each a tuned bundle of tool + stroke width + opacity + smoothing pushed into
   the engine via `updateScene({ appState })`. Excalidraw has no highlighter;
   we do.
3. **Our chrome.** Our top bar (back / notebook / page N of M / save status),
   our page-flip navigation, our page navigator, our command palette. The
   engine's default UI is trimmed via `UIOptions` + `MainMenu`/`WelcomeScreen`
   overrides.
4. **Notebook semantics.** Pages, covers, reordering, duplication, revisions,
   activity — none of which the engine knows about.

**Insulation.** Everything Excalidraw-shaped lives behind
`lib/canvas/` — an `CanvasDocument` type we own, plus `toEngine()` /
`fromEngine()` mappers and a `CanvasEngineHandle` interface. Product code never
imports `@excalidraw/excalidraw` directly. If the engine is ever replaced, the
blast radius is one folder.

**Loading.** The engine is ~1MB; it is `next/dynamic`-imported with
`ssr: false` from a client boundary, so it never touches the dashboard bundle.

---

## 2. System architecture

```text
┌───────────────────────────────────────────────────────────────┐
│  app/  — routes only, thin                                    │
│                                                               │
│  (auth)/login  (auth)/signup                                  │
│  (app)/dashboard        notebook shelf                        │
│  (app)/n/[notebookId]   pages of one notebook                 │
│  (app)/activity         streak · heatmap · timeline           │
│  (app)/search           cross-workspace search                │
│  (editor)/n/[nb]/p/[pageId]   full-bleed canvas               │
│                                                               │
│  api/auth/[...all]            Better Auth handler             │
│  api/pages/[pageId]/document  GET/PUT — hot autosave path     │
│  api/assets/[fileId]          image bytes in/out              │
│  api/activity/heartbeat       study-session ping              │
└───────────────────────────────────────────────────────────────┘
          │ server actions (CRUD)        │ route handlers (hot path)
          ▼                              ▼
┌───────────────────────────────────────────────────────────────┐
│  lib/services/   notebooks · pages · documents · activity      │
│                  search — all auth-scoped, the only layer      │
│                  allowed to touch the db                       │
├───────────────────────────────────────────────────────────────┤
│  lib/db/  drizzle schema + queries        lib/auth/  Better Auth│
├───────────────────────────────────────────────────────────────┤
│  PostgreSQL 17                                                 │
└───────────────────────────────────────────────────────────────┘
```

**Why both server actions and route handlers.** Actions are ergonomic for CRUD
with revalidation, but autosave fires every ~1.2s per keystroke-equivalent and
needs real HTTP semantics — `409 Conflict` on a stale version, `keepalive`
on `pagehide`, retry with backoff. That is a route handler's job.

**Every service function takes a `userId` and filters on it.** Authorization is
not a middleware concern; a page is reachable only through a join that proves
the notebook belongs to the caller.

---

## 3. Database schema

```text
user ──┬── workspace ──── notebook ──── page ──┬── page_document   (1:1, hot)
       │                                       ├── page_revision   (1:N, history)
       │                                       └── page_asset      (1:N, images)
       ├── activity_event   (append-only log)
       └── study_session    (heartbeat-extended intervals)
```

### Tables

**Better Auth owns** `user`, `session`, `account`, `verification` — generated by
its CLI so the adapter's expectations and our schema can't drift.

**`workspace`** — one per user today, but the indirection is what makes shared
and team workspaces a migration rather than a rewrite later.

**`notebook`** — `title`, `description`, `icon` (emoji), `color`, `coverStyle`,
`isFavorite`, `isArchived`, `sortIndex`, `pageCount` (denormalized counter),
`lastOpenedAt`, timestamps.

**`page`** — `notebookId`, `title`, `sortIndex` (**fractional index**, see
below), `paperStyle`, `thumbnail` (small data URL for previews), `textContent`
(flattened canvas text), `searchVector` (generated tsvector), `version`,
`lastEditedAt`.

**`page_document`** — the canvas itself, split from `page` on purpose. Rows here
are large and rewritten constantly; page *metadata* is read on every list view.
Keeping them apart means listing 500 pages never drags a megabyte of elements
through the buffer cache.
Columns: `pageId` (PK), `schemaVersion`, `elements` (jsonb), `appState` (jsonb),
`version` (int, optimistic concurrency), `elementCount`, `updatedAt`.

**`page_revision`** — periodic snapshot (`elements`, `appState`, `label`,
`createdAt`). Written at most once every ~5 min of active editing, so history
exists from day one without ballooning storage.

**`page_asset`** — `id` = Excalidraw's `fileId`, `pageId`, `mimeType`, `bytes`
(bytea), `byteSize`, `createdAt`. Images live *outside* the document JSON;
storing base64 inline would multiply every autosave by the size of every image
on the page. Served via `/api/assets/[fileId]` and rehydrated into the engine's
`files` map on load. Swapping bytea for S3 later touches one function.

**`activity_event`** — append-only: `userId`, `notebookId?`, `pageId?`, `type`
(`page.created` · `page.edited` · `notebook.created` · …), `metadata` jsonb,
`occurredAt`. Everything in brief §9 (timeline, heatmap, streak, per-day counts)
is a query over this, so new analytics need no new writes.

**`study_session`** — `userId`, `notebookId?`, `startedAt`, `lastHeartbeatAt`,
`endedAt`, `durationSeconds`. The client pings every 60s while the tab is
visible and editing; a gap > 5 min closes the session. This is what makes
"14 hours studied" a real number instead of a guess.

### Two schema choices worth naming

**Fractional sort index.** `sortIndex` is a `text` fractional key
(`"a0"`, `"a0V"`, `"a1"`), not an integer. Dragging page 300 to position 2
rewrites **one row**, not 300. Integer ordering would make reorder O(n) writes
on notebooks that are explicitly meant to hold hundreds of pages.

**Optimistic concurrency, not last-write-wins.** `page_document.version`
increments server-side; the client sends the version it loaded. A mismatch
returns `409` with the current server state instead of silently destroying the
other tab's work. It also leaves a clean seam for CRDT-based collaboration.

### Indexes

`notebook(user_id, is_archived, updated_at desc)`,
`page(notebook_id, sort_index)`, `page(notebook_id, updated_at desc)`,
GIN on `page.search_vector`, `activity_event(user_id, occurred_at desc)`,
`page_asset(page_id)`.

---

## 4. Autosave — brief §8, treated as a first-class subsystem

Losing work is the one unforgivable bug in a notebook app, so this gets a
proper state machine rather than a `setTimeout`.

```text
                ┌──────── change ────────┐
                ▼                        │
  idle ──▶ dirty ──(1.2s quiet | 30s max | flush)──▶ saving ──▶ saved
                ▲                                       │
                └────────── error ◀── backoff retry ◀───┘
```

- **Debounce 1.2s**, with a **30s hard ceiling** — during continuous drawing the
  quiet window never arrives, so the ceiling guarantees the brief's "at least
  every ~30 seconds".
- **Forced flush** on page navigation, tab hide, `pagehide` (via
  `fetch(..., { keepalive: true })`), and `Cmd/Ctrl+S`.
- **Local durability.** Every change is mirrored to **IndexedDB** within ~500ms,
  independent of the network. On load we compare the local draft's version and
  timestamp against the server's; a newer local draft is offered for restore.
  This is the "preserve unsaved local changes" requirement — a crash, a closed
  laptop, or an offline stretch costs nothing.
- **Failure is visible and recoverable.** Network errors retry with exponential
  backoff (1s → 2s → 4s → … capped 30s) while the indicator reads
  `⚠ Unable to save · Retrying…`. `beforeunload` warns while dirty.
- **Status UI**: `Saving…` / `✓ Saved` / `✓ Saved 10 seconds ago` (live relative
  time) / `⚠ Unable to save`.

Payload efficiency: elements are diffed by `version`+`versionNonce` before send;
an unchanged scene never hits the wire. Thumbnails and extracted text are
computed on a throttle and ride along with the save.

---

## 5. Performance plan (brief §15)

- **Split hot from cold data** — `page_document` separate from `page` (§3).
- **Virtualized lists** for notebooks and pages once past a threshold.
- **Engine isolation** — Excalidraw dynamic-imported; dashboard stays light.
- **Zero-re-render canvas chrome** — pan/zoom drives the paper layer through
  refs + `rAF`, never React state. Zoom percentage and cursor coordinates
  update the same way.
- **Server Components by default**; `"use client"` only where interaction
  demands it.
- **Optimistic UI** for create/rename/delete/reorder via `useOptimistic`.
- **Thumbnails** stored on `page`, so a 200-page grid is one query and no
  canvas work.
- **Indexes** as listed; every list query is index-covered and paginated.

---

## 6. Search (brief §16)

Postgres full-text, no external service. On each save we flatten every text
element (and container labels) into `page.textContent`; `search_vector` is a
**generated column** — `setweight(title, 'A') || setweight(textContent, 'B')` —
with a GIN index, so titles rank above body text automatically and the vector
can never fall out of sync with the row. Notebook titles are searched with
`ILIKE` + trigram. Results group by notebook, exactly as the brief sketches.

---

## 7. Extension seams for brief §17

Nothing on that list is implemented now; each is a small addition rather than a
refactor because of a decision above:

| Future feature | Seam that makes it cheap |
| --- | --- |
| Collaboration / sharing | `workspace` indirection + `version` concurrency + a `member` table |
| Public pages | one `visibility` column on `page` |
| PNG/SVG/PDF export | engine's `exportToBlob`/`exportToSvg`, already behind our adapter |
| Version history UI | `page_revision` rows already being written |
| Templates | a page duplicated from a system-owned notebook |
| Tags / bookmarks | join table against `page`; search vector already exists |
| AI assistant / summarize | `page.textContent` is already extracted per page |
| Handwriting recognition | freedraw points are preserved losslessly |
| Stylus / tablet | pressure is captured by the engine today |
| Analytics | all derived from `activity_event`; no new write paths |

---

## 8. Build order

1. Foundation — deps, Tailwind v4 theme, shadcn-style UI primitives, dark mode
2. Database — Drizzle schema, migrations, local Postgres
3. Auth — Better Auth + Drizzle adapter, `proxy.ts`, login/signup, protected routes
4. Services — auth-scoped data layer
5. Dashboard — notebook shelf, search, sort, favorites, archive
6. Notebook view — page grid, create/rename/duplicate/delete/reorder
7. Canvas — engine adapter, paper layer, ink presets, chrome
8. Autosave — state machine, IndexedDB mirror, status UI
9. Activity — heartbeats, timeline, heatmap, streak
10. Search — FTS across notebooks and pages
11. Polish — command palette, shortcuts, empty/loading/error states, toasts
12. Verify — migrate, typecheck, lint, build, walk the full flow

---

## 9. Corrections made during the build

Three things found by testing rather than by reading, recorded because they
changed the design:

**`timestamptz`, not `timestamp`.** The schema originally used `timestamp`
(without time zone). That silently records *whose clock wrote the row*: the
local Postgres session ran `Asia/Kolkata` while the machine ran `Asia/Kathmandu`,
so rows written by `defaultNow()` landed 15 minutes away from rows written with
a JS `Date`. Every column is now `timestamptz`, which stores an instant.
Measured drift afterwards: 11ms. Timeline order, streaks, heatmap buckets and
session durations all depended on this.

**The engine's stylesheet is not optional.** Without
`@excalidraw/excalidraw/index.css` the engine's container has no height rule; it
measured a degenerate box and sized its canvas to 33,554,432px. The canvas
rendered but no pointer input landed on it.

**Engine change events are not edits.** The engine emits `onChange` for
selection, cursor movement, tool switches and its own mount. Treating those as
edits pinned the status at "Unsaved" from page load and — worse — reset the
debounce forever, so the quiet window never arrived and only the 30s ceiling
ever saved. Autosave now fingerprints the scene and ignores events that carry
no actual change.

## 10. Stated assumptions

- **Single-user local development.** `DATABASE_URL` points at local Postgres;
  email verification is off and password reset is stubbed (no mail provider
  configured). Both are config flips, not code changes.
- **Assets in Postgres `bytea`** rather than object storage — correct for local
  use, and isolated behind one module for when it isn't.
- **PDF attachments** are stored and linked, not rendered inline. Embedding a
  PDF renderer on the canvas is disproportionate to its value here; images and
  screenshots — the actual study use case — are fully first-class.
- **Heatmap days are bucketed in the database session's timezone.** Correct for
  a single local user; a hosted multi-region deployment should pass the
  client's IANA zone and group with `AT TIME ZONE`.
- **Pan/zoom is persisted with the next content save**, not on its own. Saving
  on every pan would mean a write per frame; piggybacking means the viewport
  you return to is the one from your last actual edit.
- **Handwritten strokes are not searchable** — only typed text is indexed.
  Stroke points are stored losslessly, so handwriting recognition can be added
  later without a backfill.
