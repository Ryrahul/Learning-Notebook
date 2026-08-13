# Notebook

A digital study workspace. A shelf of notebooks, each holding as many pages as
you want, each page an infinite canvas you can write on, draw on, diagram on and
paste into — saved automatically, searchable, and tracked as study progress.

```text
Workspace → Notebooks → Pages → Canvas
```

## What's here

- **Shelf** — notebooks as physical objects (cover, spine, icon), with search,
  sort, favourites, archive, duplicate and delete.
- **Pages** — thumbnail grid, drag to reorder, rename inline, duplicate, delete.
- **Canvas** — freehand ink (pencil / pen / marker / highlighter), shapes,
  arrows that stay bound to the boxes they connect, on-canvas text, images,
  eraser, multi-select, group, layer, lock, infinite pan and zoom, and the usual
  keyboard shortcuts.
- **Paper** — ruled, dotted, grid or plain, panning and zooming with the canvas
  so a page reads as paper rather than a whiteboard.
- **Autosave** — debounced, with a hard 30-second ceiling, an IndexedDB mirror
  that survives crashes and offline stretches, conflict detection between tabs,
  and a visible save state.
- **Progress** — study streak, 12-month heatmap, hours studied, and a timeline
  of what you actually worked on.
- **Search** — Postgres full-text across notebook names, page titles and every
  piece of text written on any canvas.
- **Sharing** — publish a notebook as a read-only link anyone can open without
  an account. The link is a revocable token, not the notebook id, so you can
  rotate or kill it at any time.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Radix
· Better Auth · Drizzle ORM · PostgreSQL 17 · Excalidraw as the canvas engine

## Setup

Requires Node 20.9+ and a running PostgreSQL 17.

```bash
pnpm install

createdb learning_notebook

cp .env.example .env.local
# then set DATABASE_URL, and generate a secret:
#   openssl rand -base64 32   ->  BETTER_AUTH_SECRET

pnpm db:migrate
pnpm dev
```

Open http://localhost:3000 and create an account.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint, including the React Compiler rules |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm test:e2e` | Browser smoke test — needs `pnpm dev` running |
| `pnpm test:share` | Share-link + access-control test — needs `pnpm dev` running |

## Layout

```text
app/
  (auth)/        sign in / sign up
  (app)/         shelf, notebook, progress, search  — sidebar chrome
  (editor)/      the canvas                          — full bleed, no chrome
  (public)/      /share/[token] — read-only, no account needed
  api/           auth, autosave, assets, heartbeat, quick-find
components/
  canvas/        editor shell, engine adapter, paper layer, ink toolbar
  ui/            Radix-based primitives
lib/
  canvas/        canvas types, autosave, local drafts, paper maths
  db/            Drizzle schema and client
  services/      the only layer that touches the database
  actions/       server actions (thin wrappers over services)
```

Two rules keep this maintainable:

1. **Only `lib/services/*` touches the database**, and every function there is
   scoped by `userId` — authorization lives next to the data, not in a route
   guard.
2. **Only `components/canvas/canvas-engine.tsx` imports Excalidraw.** Everything
   else talks to the `EngineHandle` interface, so the engine is replaceable.
3. **`lib/services/sharing.ts` is the only module reachable without a session.**
   Every query in it is keyed by the share token and re-checks visibility, and
   its return types are separate from the owner-facing ones so a new private
   field cannot leak into the public surface by default.

## Sharing a notebook

Open a notebook → **Share** → toggle *Anyone with the link*. Copy the link and
send it; the recipient needs no account and gets a read-only view of every page,
including the canvases.

- **Revoke** by toggling sharing off — the link 404s immediately.
- **Rotate** with *Create a new link* — the previous link dies at once.
- Shared pages are `noindex`, and the link contains a random token rather than
  the notebook's id, so it is never guessable or enumerable.

## Keyboard

| Key | Action |
| --- | --- |
| `1` `2` `3` `4` | Pencil · Pen · Marker · Highlighter |
| `V` `R` `O` `A` `T` | Select · Rectangle · Ellipse · Arrow · Text |
| `⌘K` | Command palette |
| `⌘\` | Toggle page navigator |
| `⌥←` `⌥→` | Previous / next page |
| `⌘S` | Force a save (it autosaves anyway) |
| `⌘Z` / `⌘⇧Z` | Undo / redo |

## Deploying

Push to `main` and GitHub Actions builds, ships and releases it. A bare VM
needs `sudo bash deploy/provision.sh` run once first — see
[DEPLOYMENT.md](./DEPLOYMENT.md) for the server setup, the secrets CI needs,
and how to roll back.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the schema, the reasoning behind
the canvas decision, and the known limitations.
