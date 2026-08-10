import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { notebook, page, pageDocument, pageRevision } from "@/lib/db/schema";
import {
  CANVAS_SCHEMA_VERSION,
  extractText,
  type CanvasAppState,
  type CanvasDocument,
  type CanvasElement,
} from "@/lib/canvas/types";
import { recordPageEdit } from "./activity";

/**
 * Canvas document service — the autosave hot path.
 *
 * Two things matter here above all else:
 *   1. A save must never silently overwrite work done elsewhere.
 *   2. A save must never lose work because a secondary concern (thumbnail,
 *      revision, activity row) failed.
 */

/** Snapshot at most this often, measured in successful saves. */
const REVISION_EVERY_MS = 5 * 60 * 1000;

export interface LoadedDocument extends CanvasDocument {
  version: number;
  updatedAt: Date;
}

export async function loadDocument(
  userId: string,
  pageId: string,
): Promise<LoadedDocument | null> {
  const [row] = await db
    .select({
      elements: pageDocument.elements,
      appState: pageDocument.appState,
      version: pageDocument.version,
      schemaVersion: pageDocument.schemaVersion,
      updatedAt: pageDocument.updatedAt,
    })
    .from(pageDocument)
    .innerJoin(page, eq(page.id, pageDocument.pageId))
    .where(
      and(
        eq(pageDocument.pageId, pageId),
        eq(page.ownerId, userId),
        eq(page.isDeleted, false),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    schemaVersion: row.schemaVersion,
    elements: row.elements ?? [],
    appState: row.appState ?? {},
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export type SaveResult =
  | { status: "saved"; version: number; savedAt: string }
  | { status: "conflict"; serverVersion: number; document: LoadedDocument }
  | { status: "not-found" };

export interface SaveDocumentInput {
  pageId: string;
  elements: CanvasElement[];
  appState: CanvasAppState;
  /** The version the client loaded/last saved. */
  baseVersion: number;
  thumbnail?: string | null;
}

/**
 * Persist a canvas.
 *
 * Concurrency: the UPDATE is conditional on `version = baseVersion`. Two tabs
 * editing the same page can't clobber each other — the loser gets the current
 * server state back and reconciles, instead of the first tab's work quietly
 * disappearing.
 */
export async function saveDocument(
  userId: string,
  input: SaveDocumentInput,
): Promise<SaveResult> {
  const [owned] = await db
    .select({
      id: page.id,
      notebookId: page.notebookId,
      title: page.title,
    })
    .from(page)
    .where(
      and(
        eq(page.id, input.pageId),
        eq(page.ownerId, userId),
        eq(page.isDeleted, false),
      ),
    )
    .limit(1);

  if (!owned) return { status: "not-found" };

  const liveElements = input.elements.filter((el) => !el.isDeleted);
  const textContent = extractText(input.elements);
  const now = new Date();

  const [updated] = await db
    .update(pageDocument)
    .set({
      elements: input.elements,
      appState: input.appState,
      elementCount: liveElements.length,
      schemaVersion: CANVAS_SCHEMA_VERSION,
      version: sql`${pageDocument.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(pageDocument.pageId, input.pageId),
        eq(pageDocument.version, input.baseVersion),
      ),
    )
    .returning({ version: pageDocument.version });

  if (!updated) {
    // Either a stale base version, or the document row is missing entirely.
    const current = await loadDocument(userId, input.pageId);
    if (!current) return { status: "not-found" };
    return {
      status: "conflict",
      serverVersion: current.version,
      document: current,
    };
  }

  // Metadata and analytics: best-effort. The canvas is already durable, and a
  // failed thumbnail must not turn a successful save into an error.
  void afterSave({
    userId,
    pageId: input.pageId,
    notebookId: owned.notebookId,
    pageTitle: owned.title,
    textContent,
    thumbnail: input.thumbnail,
    elements: input.elements,
    appState: input.appState,
    version: updated.version,
    at: now,
  }).catch((error) => {
    console.error("[documents] post-save bookkeeping failed", error);
  });

  return {
    status: "saved",
    version: updated.version,
    savedAt: now.toISOString(),
  };
}

async function afterSave(params: {
  userId: string;
  pageId: string;
  notebookId: string;
  pageTitle: string;
  textContent: string;
  thumbnail?: string | null;
  elements: CanvasElement[];
  appState: CanvasAppState;
  version: number;
  at: Date;
}) {
  await db
    .update(page)
    .set({
      textContent: params.textContent,
      lastEditedAt: params.at,
      ...(params.thumbnail !== undefined
        ? { thumbnail: params.thumbnail }
        : {}),
    })
    .where(eq(page.id, params.pageId));

  const [book] = await db
    .update(notebook)
    .set({ updatedAt: params.at })
    .where(eq(notebook.id, params.notebookId))
    .returning({ title: notebook.title });

  await Promise.all([
    maybeWriteRevision(params),
    recordPageEdit({
      userId: params.userId,
      notebookId: params.notebookId,
      pageId: params.pageId,
      pageTitle: params.pageTitle,
      notebookTitle: book?.title ?? "",
    }),
  ]);
}

/**
 * Snapshot the canvas at most once per REVISION_EVERY_MS of active editing, so
 * version history exists from day one without storing a copy per keystroke.
 */
async function maybeWriteRevision(params: {
  pageId: string;
  elements: CanvasElement[];
  appState: CanvasAppState;
  version: number;
  at: Date;
}) {
  const [latest] = await db
    .select({ createdAt: pageRevision.createdAt })
    .from(pageRevision)
    .where(eq(pageRevision.pageId, params.pageId))
    .orderBy(desc(pageRevision.createdAt))
    .limit(1);

  const due =
    !latest ||
    params.at.getTime() - latest.createdAt.getTime() >= REVISION_EVERY_MS;

  if (!due) return;

  await db.insert(pageRevision).values({
    pageId: params.pageId,
    version: params.version,
    elements: params.elements,
    appState: params.appState,
  });
}

export async function listRevisions(userId: string, pageId: string) {
  return db
    .select({
      id: pageRevision.id,
      version: pageRevision.version,
      label: pageRevision.label,
      createdAt: pageRevision.createdAt,
    })
    .from(pageRevision)
    .innerJoin(page, eq(page.id, pageRevision.pageId))
    .where(and(eq(pageRevision.pageId, pageId), eq(page.ownerId, userId)))
    .orderBy(desc(pageRevision.createdAt))
    .limit(50);
}
