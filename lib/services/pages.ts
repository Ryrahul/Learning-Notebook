import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  notebook,
  page,
  pageDocument,
  type Page,
  type PaperStyle,
} from "@/lib/db/schema";
import { keyAfter, keyBetween, keyForPosition } from "@/lib/ordering";
import { recordActivity } from "./activity";

/**
 * Page service.
 *
 * Reads here deliberately never touch `page_document`: page lists, grids and
 * navigators only need metadata, and joining the canvas blob in would make
 * opening a 300-page notebook cost megabytes.
 */

/** Page metadata as every list view needs it. */
export type PageSummary = Pick<
  Page,
  | "id"
  | "notebookId"
  | "title"
  | "sortIndex"
  | "paperStyle"
  | "thumbnail"
  | "lastEditedAt"
  | "createdAt"
>;

const PAGE_SUMMARY_COLUMNS = {
  id: page.id,
  notebookId: page.notebookId,
  title: page.title,
  sortIndex: page.sortIndex,
  paperStyle: page.paperStyle,
  thumbnail: page.thumbnail,
  lastEditedAt: page.lastEditedAt,
  createdAt: page.createdAt,
} as const;

export async function listPages(
  userId: string,
  notebookId: string,
): Promise<PageSummary[]> {
  return db
    .select(PAGE_SUMMARY_COLUMNS)
    .from(page)
    .where(
      and(
        eq(page.notebookId, notebookId),
        eq(page.ownerId, userId),
        eq(page.isDeleted, false),
      ),
    )
    .orderBy(asc(page.sortIndex));
}

export async function getPage(
  userId: string,
  pageId: string,
): Promise<Page | null> {
  const [found] = await db
    .select()
    .from(page)
    .where(
      and(
        eq(page.id, pageId),
        eq(page.ownerId, userId),
        eq(page.isDeleted, false),
      ),
    )
    .limit(1);
  return found ?? null;
}

/**
 * A page plus everything the editor chrome needs to render around it, in one
 * round trip: its notebook, its position, and its neighbours for page-flipping.
 */
export interface PageContext {
  page: Page;
  notebook: { id: string; title: string; icon: string; color: string };
  index: number;
  total: number;
  previousPageId: string | null;
  nextPageId: string | null;
}

export async function getPageContext(
  userId: string,
  pageId: string,
): Promise<PageContext | null> {
  const current = await getPage(userId, pageId);
  if (!current) return null;

  const [book] = await db
    .select({
      id: notebook.id,
      title: notebook.title,
      icon: notebook.icon,
      color: notebook.color,
    })
    .from(notebook)
    .where(
      and(eq(notebook.id, current.notebookId), eq(notebook.ownerId, userId)),
    )
    .limit(1);

  if (!book) return null;

  const siblings = await db
    .select({ id: page.id })
    .from(page)
    .where(
      and(
        eq(page.notebookId, current.notebookId),
        eq(page.isDeleted, false),
      ),
    )
    .orderBy(asc(page.sortIndex));

  const index = siblings.findIndex((p) => p.id === pageId);

  return {
    page: current,
    notebook: book,
    index,
    total: siblings.length,
    previousPageId: index > 0 ? siblings[index - 1].id : null,
    nextPageId:
      index >= 0 && index < siblings.length - 1 ? siblings[index + 1].id : null,
  };
}

export interface CreatePageInput {
  title?: string;
  paperStyle?: PaperStyle;
  /** Insert directly after this page instead of at the end. */
  afterPageId?: string;
}

export async function createPage(
  userId: string,
  notebookId: string,
  input: CreatePageInput = {},
): Promise<Page | null> {
  const [book] = await db
    .select({ id: notebook.id, title: notebook.title })
    .from(notebook)
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)))
    .limit(1);
  if (!book) return null;

  const created = await db.transaction(async (tx) => {
    const sortIndex = await nextSortIndex(tx, notebookId, input.afterPageId);

    const existingCount = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(page)
      .where(and(eq(page.notebookId, notebookId), eq(page.isDeleted, false)));

    const [row] = await tx
      .insert(page)
      .values({
        notebookId,
        ownerId: userId,
        title: input.title?.trim() || `Page ${(existingCount[0]?.count ?? 0) + 1}`,
        sortIndex,
        paperStyle: input.paperStyle ?? "dotted",
      })
      .returning();

    // Create the document row eagerly so the editor's first save is an UPDATE
    // and never races two concurrent INSERTs.
    await tx.insert(pageDocument).values({ pageId: row.id });

    await tx
      .update(notebook)
      .set({ pageCount: sql`${notebook.pageCount} + 1`, updatedAt: new Date() })
      .where(eq(notebook.id, notebookId));

    return row;
  });

  await recordActivity({
    userId,
    type: "page.created",
    notebookId,
    pageId: created.id,
    metadata: { pageTitle: created.title, notebookTitle: book.title },
  });

  return created;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function nextSortIndex(
  tx: Tx,
  notebookId: string,
  afterPageId?: string,
): Promise<string> {
  if (afterPageId) {
    const [anchor] = await tx
      .select({ sortIndex: page.sortIndex })
      .from(page)
      .where(eq(page.id, afterPageId))
      .limit(1);

    if (anchor) {
      const [following] = await tx
        .select({ sortIndex: page.sortIndex })
        .from(page)
        .where(
          and(
            eq(page.notebookId, notebookId),
            eq(page.isDeleted, false),
            sql`${page.sortIndex} > ${anchor.sortIndex}`,
          ),
        )
        .orderBy(asc(page.sortIndex))
        .limit(1);

      return keyBetween(anchor.sortIndex, following?.sortIndex ?? null);
    }
  }

  const [last] = await tx
    .select({ sortIndex: page.sortIndex })
    .from(page)
    .where(and(eq(page.notebookId, notebookId), eq(page.isDeleted, false)))
    .orderBy(desc(page.sortIndex))
    .limit(1);

  return keyAfter(last?.sortIndex ?? null);
}

export async function renamePage(
  userId: string,
  pageId: string,
  title: string,
): Promise<Page | null> {
  const [updated] = await db
    .update(page)
    .set({ title: title.trim() || "Untitled page" })
    .where(and(eq(page.id, pageId), eq(page.ownerId, userId)))
    .returning();

  if (updated) {
    await recordActivity({
      userId,
      type: "page.renamed",
      notebookId: updated.notebookId,
      pageId,
      metadata: { pageTitle: updated.title },
    });
  }

  return updated ?? null;
}

export async function setPaperStyle(
  userId: string,
  pageId: string,
  paperStyle: PaperStyle,
) {
  await db
    .update(page)
    .set({ paperStyle })
    .where(and(eq(page.id, pageId), eq(page.ownerId, userId)));
}

/**
 * Soft delete.
 *
 * The row and its canvas stay put so a future trash/undo feature has something
 * to restore, and so an in-flight autosave from a still-open tab can't
 * resurrect a half-deleted page.
 */
export async function deletePage(userId: string, pageId: string) {
  const target = await getPage(userId, pageId);
  if (!target) return false;

  await db.transaction(async (tx) => {
    await tx
      .update(page)
      .set({ isDeleted: true })
      .where(and(eq(page.id, pageId), eq(page.ownerId, userId)));

    await tx
      .update(notebook)
      .set({
        pageCount: sql`greatest(${notebook.pageCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(notebook.id, target.notebookId));
  });

  await recordActivity({
    userId,
    type: "page.deleted",
    notebookId: target.notebookId,
    metadata: { pageTitle: target.title },
  });

  return true;
}

export async function duplicatePage(
  userId: string,
  pageId: string,
): Promise<Page | null> {
  const source = await getPage(userId, pageId);
  if (!source) return null;

  const copy = await db.transaction(async (tx) => {
    const sortIndex = await nextSortIndex(tx, source.notebookId, source.id);

    const [row] = await tx
      .insert(page)
      .values({
        notebookId: source.notebookId,
        ownerId: userId,
        title: `${source.title} (copy)`,
        sortIndex,
        paperStyle: source.paperStyle,
        thumbnail: source.thumbnail,
        textContent: source.textContent,
      })
      .returning();

    const [sourceDoc] = await tx
      .select()
      .from(pageDocument)
      .where(eq(pageDocument.pageId, source.id))
      .limit(1);

    await tx.insert(pageDocument).values({
      pageId: row.id,
      elements: sourceDoc?.elements ?? [],
      appState: sourceDoc?.appState ?? {},
      elementCount: sourceDoc?.elementCount ?? 0,
      schemaVersion: sourceDoc?.schemaVersion ?? 1,
    });

    await tx
      .update(notebook)
      .set({ pageCount: sql`${notebook.pageCount} + 1`, updatedAt: new Date() })
      .where(eq(notebook.id, source.notebookId));

    return row;
  });

  await recordActivity({
    userId,
    type: "page.duplicated",
    notebookId: source.notebookId,
    pageId: copy.id,
    metadata: { pageTitle: copy.title },
  });

  return copy;
}

/** Move a page to `targetIndex`. Rewrites exactly one row. */
export async function reorderPage(
  userId: string,
  pageId: string,
  targetIndex: number,
) {
  const target = await getPage(userId, pageId);
  if (!target) return false;

  const siblings = await db
    .select({ id: page.id, sortIndex: page.sortIndex })
    .from(page)
    .where(
      and(eq(page.notebookId, target.notebookId), eq(page.isDeleted, false)),
    )
    .orderBy(asc(page.sortIndex));

  const without = siblings.filter((p) => p.id !== pageId);
  const sortIndex = keyForPosition(without, targetIndex);

  await db
    .update(page)
    .set({ sortIndex })
    .where(and(eq(page.id, pageId), eq(page.ownerId, userId)));

  return true;
}

/** Bulk metadata fetch used by search results and the command palette. */
export async function getPageSummaries(
  userId: string,
  pageIds: string[],
): Promise<PageSummary[]> {
  if (pageIds.length === 0) return [];
  return db
    .select(PAGE_SUMMARY_COLUMNS)
    .from(page)
    .where(and(eq(page.ownerId, userId), inArray(page.id, pageIds)));
}

/** Most recently edited pages across the whole workspace. */
export async function recentPages(userId: string, limit = 8) {
  return db
    .select({
      ...PAGE_SUMMARY_COLUMNS,
      notebookTitle: notebook.title,
      notebookIcon: notebook.icon,
      notebookColor: notebook.color,
    })
    .from(page)
    .innerJoin(notebook, eq(page.notebookId, notebook.id))
    .where(
      and(
        eq(page.ownerId, userId),
        eq(page.isDeleted, false),
        eq(notebook.isArchived, false),
      ),
    )
    .orderBy(desc(page.lastEditedAt))
    .limit(limit);
}
