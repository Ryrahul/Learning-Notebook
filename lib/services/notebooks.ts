import "server-only";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  notebook,
  page,
  pageDocument,
  type Notebook,
  type NotebookColor,
} from "@/lib/db/schema";
import { keyAfter, keyForPosition } from "@/lib/ordering";
import { getOrCreateWorkspace } from "./workspace";
import { recordActivity } from "./activity";

/**
 * Notebook service.
 *
 * Every function takes `userId` and filters on it. Authorization is not
 * delegated to a route guard: a notebook is only reachable through a query
 * that proves ownership, so a forged id returns "not found" rather than
 * someone else's data.
 */

export type NotebookSort = "recent" | "alphabetical" | "created" | "manual";

/**
 * List rows are an explicit projection, not `Notebook`.
 *
 * Notably absent: `shareToken`. A share token is a capability — there is no
 * reason to ship one to every card on the shelf, and deriving this type from
 * the full row would mean any future secret-ish column leaks here by default.
 */
export type NotebookListItem = Pick<
  Notebook,
  | "id"
  | "workspaceId"
  | "ownerId"
  | "title"
  | "description"
  | "icon"
  | "color"
  | "isFavorite"
  | "isArchived"
  | "visibility"
  | "sortIndex"
  | "pageCount"
  | "lastOpenedAt"
  | "createdAt"
  | "updatedAt"
> & { livePageCount: number };

export interface ListNotebooksOptions {
  sort?: NotebookSort;
  query?: string;
  filter?: "all" | "favorites" | "archived";
  limit?: number;
}

export async function listNotebooks(
  userId: string,
  options: ListNotebooksOptions = {},
): Promise<NotebookListItem[]> {
  const { sort = "recent", query, filter = "all", limit = 500 } = options;

  const orderBy =
    sort === "alphabetical"
      ? [asc(sql`lower(${notebook.title})`)]
      : sort === "created"
        ? [desc(notebook.createdAt)]
        : sort === "manual"
          ? [asc(notebook.sortIndex)]
          : [
              // "Recent" means recently *used*, which is opened-or-edited.
              desc(sql`greatest(${notebook.updatedAt}, coalesce(${notebook.lastOpenedAt}, ${notebook.createdAt}))`),
            ];

  return db
    .select({
      id: notebook.id,
      workspaceId: notebook.workspaceId,
      ownerId: notebook.ownerId,
      title: notebook.title,
      description: notebook.description,
      icon: notebook.icon,
      color: notebook.color,
      isFavorite: notebook.isFavorite,
      isArchived: notebook.isArchived,
      visibility: notebook.visibility,
      sortIndex: notebook.sortIndex,
      pageCount: notebook.pageCount,
      lastOpenedAt: notebook.lastOpenedAt,
      createdAt: notebook.createdAt,
      updatedAt: notebook.updatedAt,
      livePageCount: notebook.pageCount,
    })
    .from(notebook)
    .where(
      and(
        eq(notebook.ownerId, userId),
        filter === "archived"
          ? eq(notebook.isArchived, true)
          : eq(notebook.isArchived, false),
        filter === "favorites" ? eq(notebook.isFavorite, true) : undefined,
        query
          ? or(
              ilike(notebook.title, `%${query}%`),
              ilike(notebook.description, `%${query}%`),
            )
          : undefined,
      ),
    )
    .orderBy(...orderBy)
    .limit(limit);
}

export async function getNotebook(
  userId: string,
  notebookId: string,
): Promise<Notebook | null> {
  const [found] = await db
    .select()
    .from(notebook)
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)))
    .limit(1);
  return found ?? null;
}

export interface CreateNotebookInput {
  title: string;
  description?: string | null;
  icon?: string;
  color?: NotebookColor;
}

export async function createNotebook(
  userId: string,
  input: CreateNotebookInput,
): Promise<Notebook> {
  const workspace = await getOrCreateWorkspace(userId);

  const [last] = await db
    .select({ sortIndex: notebook.sortIndex })
    .from(notebook)
    .where(eq(notebook.ownerId, userId))
    .orderBy(desc(notebook.sortIndex))
    .limit(1);

  const [created] = await db
    .insert(notebook)
    .values({
      workspaceId: workspace.id,
      ownerId: userId,
      title: input.title.trim() || "Untitled notebook",
      description: input.description?.trim() || null,
      icon: input.icon ?? "📓",
      color: input.color ?? "indigo",
      sortIndex: keyAfter(last?.sortIndex ?? null),
    })
    .returning();

  await recordActivity({
    userId,
    type: "notebook.created",
    notebookId: created.id,
    metadata: { notebookTitle: created.title },
  });

  return created;
}

export interface UpdateNotebookInput {
  title?: string;
  description?: string | null;
  icon?: string;
  color?: NotebookColor;
  isFavorite?: boolean;
  isArchived?: boolean;
}

export async function updateNotebook(
  userId: string,
  notebookId: string,
  input: UpdateNotebookInput,
): Promise<Notebook | null> {
  const patch: Partial<typeof notebook.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title.trim() || "Untitled notebook";
  if (input.description !== undefined)
    patch.description = input.description?.trim() || null;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.color !== undefined) patch.color = input.color;
  if (input.isFavorite !== undefined) patch.isFavorite = input.isFavorite;
  if (input.isArchived !== undefined) patch.isArchived = input.isArchived;

  if (Object.keys(patch).length === 0) return getNotebook(userId, notebookId);

  const [updated] = await db
    .update(notebook)
    .set(patch)
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)))
    .returning();

  if (updated && input.title !== undefined) {
    await recordActivity({
      userId,
      type: "notebook.renamed",
      notebookId,
      metadata: { notebookTitle: updated.title },
    });
  }

  return updated ?? null;
}

export async function deleteNotebook(userId: string, notebookId: string) {
  const existing = await getNotebook(userId, notebookId);
  if (!existing) return false;

  // Pages, documents, revisions and assets all cascade from this row.
  await db
    .delete(notebook)
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)));

  await recordActivity({
    userId,
    type: "notebook.deleted",
    metadata: { notebookTitle: existing.title },
  });

  return true;
}

/**
 * Deep-copy a notebook and all of its pages, including canvas documents.
 *
 * Done in one transaction with set-based inserts rather than a loop, so
 * duplicating a 400-page notebook is a handful of statements.
 */
export async function duplicateNotebook(
  userId: string,
  notebookId: string,
): Promise<Notebook | null> {
  const source = await getNotebook(userId, notebookId);
  if (!source) return null;

  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ sortIndex: notebook.sortIndex })
      .from(notebook)
      .where(eq(notebook.ownerId, userId))
      .orderBy(desc(notebook.sortIndex))
      .limit(1);

    const [copy] = await tx
      .insert(notebook)
      .values({
        workspaceId: source.workspaceId,
        ownerId: userId,
        title: `${source.title} (copy)`,
        description: source.description,
        icon: source.icon,
        color: source.color,
        sortIndex: keyAfter(last?.sortIndex ?? null),
        pageCount: source.pageCount,
      })
      .returning();

    const sourcePages = await tx
      .select()
      .from(page)
      .where(and(eq(page.notebookId, notebookId), eq(page.isDeleted, false)))
      .orderBy(asc(page.sortIndex));

    if (sourcePages.length > 0) {
      const insertedPages = await tx
        .insert(page)
        .values(
          sourcePages.map((p) => ({
            notebookId: copy.id,
            ownerId: userId,
            title: p.title,
            sortIndex: p.sortIndex,
            paperStyle: p.paperStyle,
            thumbnail: p.thumbnail,
            textContent: p.textContent,
          })),
        )
        .returning({ id: page.id });

      const sourceDocs = await tx
        .select()
        .from(pageDocument)
        .where(
          inArray(
            pageDocument.pageId,
            sourcePages.map((p) => p.id),
          ),
        );

      const docByPageId = new Map(sourceDocs.map((d) => [d.pageId, d]));
      const newDocs = sourcePages.map((sourcePage, i) => {
        const doc = docByPageId.get(sourcePage.id);
        return {
          pageId: insertedPages[i].id,
          elements: doc?.elements ?? [],
          appState: doc?.appState ?? {},
          elementCount: doc?.elementCount ?? 0,
          schemaVersion: doc?.schemaVersion ?? 1,
        };
      });

      if (newDocs.length > 0) {
        await tx.insert(pageDocument).values(newDocs);
      }
    }

    await recordActivity({
      userId,
      type: "notebook.created",
      notebookId: copy.id,
      metadata: { notebookTitle: copy.title, duplicatedFrom: source.title },
    });

    return copy;
  });
}

/** Records that the notebook was opened — drives "recently opened" ordering. */
export async function touchNotebook(userId: string, notebookId: string) {
  await db
    .update(notebook)
    .set({ lastOpenedAt: new Date() })
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)));
}

export async function reorderNotebook(
  userId: string,
  notebookId: string,
  targetIndex: number,
) {
  const siblings = await db
    .select({ id: notebook.id, sortIndex: notebook.sortIndex })
    .from(notebook)
    .where(and(eq(notebook.ownerId, userId), eq(notebook.isArchived, false)))
    .orderBy(asc(notebook.sortIndex));

  const without = siblings.filter((n) => n.id !== notebookId);
  const sortIndex = keyForPosition(without, targetIndex);

  await db
    .update(notebook)
    .set({ sortIndex })
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)));
}

/** Repairs the denormalised counter; cheap enough to call after bulk changes. */
export async function syncPageCount(notebookId: string) {
  await db
    .update(notebook)
    .set({
      pageCount: sql`(select count(*)::int from ${page} where ${page.notebookId} = ${notebookId} and ${page.isDeleted} = false)`,
    })
    .where(eq(notebook.id, notebookId));
}
