/**
 * Application schema.
 *
 * Shape: user → workspace → notebook → page → { document, revisions, assets }
 * plus two user-scoped logs (activity events, study sessions) that everything
 * in the progress/analytics surface is derived from.
 */
import { relations, sql, type SQL } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import type {
  CanvasAppState,
  CanvasElement,
} from "@/lib/canvas/types";

/** Postgres `tsvector`, which drizzle has no first-class column type for. */
const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

/** Raw image/file bytes. */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType: () => "bytea",
});

export const PAPER_STYLES = ["plain", "dotted", "grid", "ruled"] as const;
export type PaperStyle = (typeof PAPER_STYLES)[number];

export const NOTEBOOK_COLORS = [
  "indigo",
  "violet",
  "blue",
  "teal",
  "emerald",
  "amber",
  "orange",
  "rose",
  "slate",
] as const;
export type NotebookColor = (typeof NOTEBOOK_COLORS)[number];

/**
 * Who can read a notebook.
 *
 * `link` is "unlisted": anyone holding the share token can read it, nobody can
 * write it, and it is never listed or indexed. Modelled as a column rather
 * than a boolean so `workspace` and `password` can be added without a
 * migration to the shape.
 */
export const NOTEBOOK_VISIBILITIES = ["private", "link"] as const;
export type NotebookVisibility = (typeof NOTEBOOK_VISIBILITIES)[number];

/**
 * Activity types are a TypeScript union rather than a Postgres enum on
 * purpose: new analytics events should not require a migration.
 */
export type ActivityType =
  | "notebook.created"
  | "notebook.renamed"
  | "notebook.deleted"
  | "notebook.opened"
  | "page.created"
  | "page.edited"
  | "page.renamed"
  | "page.deleted"
  | "page.duplicated"
  | "image.added";

/* -------------------------------------------------------------------------- */
/*  Workspace                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One per user today. The indirection exists so shared/team workspaces are a
 * membership table away rather than a schema rewrite.
 */
export const workspace = pgTable(
  "workspace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("My Study Space"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("workspace_owner_idx").on(table.ownerId)],
);

/* -------------------------------------------------------------------------- */
/*  Notebook                                                                   */
/* -------------------------------------------------------------------------- */

export const notebook = pgTable(
  "notebook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    // Denormalised from workspace so every list query filters on one index
    // instead of joining through workspace on the hot path.
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),
    icon: text("icon").notNull().default("📓"),
    color: text("color").$type<NotebookColor>().notNull().default("indigo"),

    isFavorite: boolean("is_favorite").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),

    visibility: text("visibility")
      .$type<NotebookVisibility>()
      .notNull()
      .default("private"),
    /**
     * Capability token for the share link — deliberately NOT the notebook id.
     *
     * A separate token means the link can be revoked and rotated without
     * touching the notebook's identity, and a leaked link never exposes an
     * internal id. Cleared on revoke, so old links die immediately.
     */
    shareToken: text("share_token").unique(),
    sharedAt: timestamp("shared_at", { withTimezone: true }),

    /** Fractional index — reordering rewrites one row, never the whole list. */
    sortIndex: text("sort_index").notNull(),

    /** Denormalised counter; maintained transactionally by the page service. */
    pageCount: integer("page_count").notNull().default(0),

    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("notebook_owner_archived_updated_idx").on(
      table.ownerId,
      table.isArchived,
      table.updatedAt.desc(),
    ),
    index("notebook_workspace_sort_idx").on(table.workspaceId, table.sortIndex),
    index("notebook_owner_favorite_idx").on(table.ownerId, table.isFavorite),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Page *metadata*. Deliberately small: this is what page lists, grids and
 * search read. The canvas itself lives in `pageDocument`.
 */
export const page = pgTable(
  "page",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebook.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    title: text("title").notNull().default("Untitled page"),
    sortIndex: text("sort_index").notNull(),
    paperStyle: text("paper_style")
      .$type<PaperStyle>()
      .notNull()
      .default("dotted"),

    /** Small data-URL preview so page grids need no canvas work. */
    thumbnail: text("thumbnail"),

    /** Flattened canvas text, refreshed on save — powers full-text search. */
    textContent: text("text_content").notNull().default(""),

    isDeleted: boolean("is_deleted").notNull().default(false),

    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),

    /**
     * Generated so it can never drift from the row. Title outranks body text.
     * `to_tsvector` is only IMMUTABLE with an explicit config argument, which
     * a generated column requires.
     */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${page.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${page.textContent}, '')), 'B')`,
    ),
  },
  (table) => [
    index("page_notebook_sort_idx").on(table.notebookId, table.sortIndex),
    index("page_notebook_edited_idx").on(
      table.notebookId,
      table.lastEditedAt.desc(),
    ),
    index("page_owner_edited_idx").on(table.ownerId, table.lastEditedAt.desc()),
    index("page_search_idx").using("gin", table.searchVector),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Page document — the canvas                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Split from `page` because these rows are large and rewritten on every
 * autosave, while page metadata is read by every list view. Keeping them apart
 * means listing 500 pages never drags megabytes of elements through cache.
 */
export const pageDocument = pgTable("page_document", {
  pageId: uuid("page_id")
    .primaryKey()
    .references(() => page.id, { onDelete: "cascade" }),

  /** Bumped when the serialised shape changes, so old rows can be migrated. */
  schemaVersion: integer("schema_version").notNull().default(1),

  elements: jsonb("elements").$type<CanvasElement[]>().notNull().default([]),
  appState: jsonb("app_state").$type<CanvasAppState>().notNull().default({}),

  /** Optimistic concurrency token; a stale write gets 409, never silent loss. */
  version: integer("version").notNull().default(0),
  elementCount: integer("element_count").notNull().default(0),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/* -------------------------------------------------------------------------- */
/*  Page revision — history                                                    */
/* -------------------------------------------------------------------------- */

/** Snapshot written at most once per ~5 minutes of active editing. */
export const pageRevision = pgTable(
  "page_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    elements: jsonb("elements").$type<CanvasElement[]>().notNull(),
    appState: jsonb("app_state").$type<CanvasAppState>().notNull().default({}),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("page_revision_page_created_idx").on(
      table.pageId,
      table.createdAt.desc(),
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Page asset — images and files                                              */
/* -------------------------------------------------------------------------- */

/**
 * Binary lives here rather than inline in the document JSON: base64 images
 * inside `elements` would multiply every autosave by the size of every image
 * on the page. `id` is the canvas engine's own file id.
 *
 * Swapping bytea for object storage later touches only the asset service.
 */
export const pageAsset = pgTable(
  "page_asset",
  {
    id: text("id").primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    bytes: bytea("bytes").notNull(),
    fileName: text("file_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("page_asset_page_idx").on(table.pageId)],
);

/* -------------------------------------------------------------------------- */
/*  Activity log                                                               */
/* -------------------------------------------------------------------------- */

/** Append-only. Every timeline, heatmap, streak and counter is a query here. */
export const activityEvent = pgTable(
  "activity_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    notebookId: uuid("notebook_id").references(() => notebook.id, {
      onDelete: "cascade",
    }),
    pageId: uuid("page_id").references(() => page.id, { onDelete: "set null" }),
    type: text("type").$type<ActivityType>().notNull(),
    /** Denormalised titles so the timeline survives deletion of its subject. */
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("activity_user_time_idx").on(table.userId, table.occurredAt.desc()),
    index("activity_notebook_time_idx").on(
      table.notebookId,
      table.occurredAt.desc(),
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Study session                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Extended by a client heartbeat while the editor is visible and being used.
 * A gap longer than the stale threshold closes the session, which is what
 * makes "hours studied" a measurement rather than a guess.
 */
export const studySession = pgTable(
  "study_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    notebookId: uuid("notebook_id").references(() => notebook.id, {
      onDelete: "set null",
    }),
    pageId: uuid("page_id").references(() => page.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
    durationSeconds: integer("duration_seconds").notNull().default(0),
  },
  (table) => [
    index("study_session_user_time_idx").on(
      table.userId,
      table.startedAt.desc(),
    ),
    // Finding "the session to extend" is a lookup on this pair.
    index("study_session_user_heartbeat_idx").on(
      table.userId,
      table.lastHeartbeatAt.desc(),
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const workspaceRelations = relations(workspace, ({ one, many }) => ({
  owner: one(user, { fields: [workspace.ownerId], references: [user.id] }),
  notebooks: many(notebook),
}));

export const notebookRelations = relations(notebook, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [notebook.workspaceId],
    references: [workspace.id],
  }),
  pages: many(page),
}));

export const pageRelations = relations(page, ({ one, many }) => ({
  notebook: one(notebook, {
    fields: [page.notebookId],
    references: [notebook.id],
  }),
  document: one(pageDocument, {
    fields: [page.id],
    references: [pageDocument.pageId],
  }),
  revisions: many(pageRevision),
  assets: many(pageAsset),
}));

export const pageDocumentRelations = relations(pageDocument, ({ one }) => ({
  page: one(page, { fields: [pageDocument.pageId], references: [page.id] }),
}));

export const pageRevisionRelations = relations(pageRevision, ({ one }) => ({
  page: one(page, { fields: [pageRevision.pageId], references: [page.id] }),
}));

export const pageAssetRelations = relations(pageAsset, ({ one }) => ({
  page: one(page, { fields: [pageAsset.pageId], references: [page.id] }),
}));

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type Workspace = typeof workspace.$inferSelect;
export type Notebook = typeof notebook.$inferSelect;
export type NewNotebook = typeof notebook.$inferInsert;
export type Page = typeof page.$inferSelect;
export type NewPage = typeof page.$inferInsert;
export type PageDocument = typeof pageDocument.$inferSelect;
export type PageRevision = typeof pageRevision.$inferSelect;
export type PageAsset = typeof pageAsset.$inferSelect;
export type ActivityEvent = typeof activityEvent.$inferSelect;
export type StudySession = typeof studySession.$inferSelect;
