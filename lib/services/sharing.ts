import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  notebook,
  page,
  pageAsset,
  pageDocument,
  type NotebookVisibility,
} from "@/lib/db/schema";
import type {
  CanvasAppState,
  CanvasAsset,
  CanvasElement,
  PaperStyle,
} from "@/lib/canvas/types";

/**
 * Public sharing.
 *
 * The security model, stated plainly because this is the only surface in the
 * app reachable without a session:
 *
 *  - A share link is a **capability token**, not the notebook id. It can be
 *    revoked and rotated; the notebook's identity never changes and is never
 *    exposed.
 *  - The token is 192 bits of CSPRNG entropy, so enumeration is not a threat.
 *  - Every read below is keyed by the token and re-checks `visibility = 'link'`
 *    on the *same query*. Revoking takes effect on the next request; there is
 *    no cached capability to invalidate.
 *  - Nothing here returns owner identity, other notebooks, activity, study
 *    sessions, or any private-page content. The return types are separate from
 *    the owner-facing ones so a future field added to the private shape cannot
 *    silently start leaking.
 *  - Reads only. There is no public write path at all — the autosave and asset
 *    endpoints require a session and are unaware that sharing exists.
 */

/** 24 bytes → 32 url-safe chars. */
function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/* -------------------------------------------------------------------------- */
/*  Owner-side: managing the link                                              */
/* -------------------------------------------------------------------------- */

export interface ShareState {
  visibility: NotebookVisibility;
  shareToken: string | null;
  sharedAt: Date | null;
}

export async function getShareState(
  userId: string,
  notebookId: string,
): Promise<ShareState | null> {
  const [row] = await db
    .select({
      visibility: notebook.visibility,
      shareToken: notebook.shareToken,
      sharedAt: notebook.sharedAt,
    })
    .from(notebook)
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)))
    .limit(1);

  return row ?? null;
}

/** Turn on link sharing, minting a token if there isn't one. */
export async function enableSharing(
  userId: string,
  notebookId: string,
): Promise<ShareState | null> {
  const current = await getShareState(userId, notebookId);
  if (!current) return null;

  // Re-enabling keeps the existing token so links already handed out keep
  // working; use `rotateShareLink` to deliberately break them.
  const token = current.shareToken ?? newShareToken();

  const [row] = await db
    .update(notebook)
    .set({
      visibility: "link",
      shareToken: token,
      sharedAt: current.sharedAt ?? new Date(),
    })
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)))
    .returning({
      visibility: notebook.visibility,
      shareToken: notebook.shareToken,
      sharedAt: notebook.sharedAt,
    });

  return row ?? null;
}

/**
 * Revoke. Clears the token as well as flipping visibility, so a link that
 * leaked cannot be reactivated by simply turning sharing back on.
 */
export async function disableSharing(
  userId: string,
  notebookId: string,
): Promise<ShareState | null> {
  const [row] = await db
    .update(notebook)
    .set({ visibility: "private", shareToken: null, sharedAt: null })
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)))
    .returning({
      visibility: notebook.visibility,
      shareToken: notebook.shareToken,
      sharedAt: notebook.sharedAt,
    });

  return row ?? null;
}

/** New token, old links dead immediately. */
export async function rotateShareLink(
  userId: string,
  notebookId: string,
): Promise<ShareState | null> {
  const [row] = await db
    .update(notebook)
    .set({
      visibility: "link",
      shareToken: newShareToken(),
      sharedAt: new Date(),
    })
    .where(and(eq(notebook.id, notebookId), eq(notebook.ownerId, userId)))
    .returning({
      visibility: notebook.visibility,
      shareToken: notebook.shareToken,
      sharedAt: notebook.sharedAt,
    });

  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Public side: reading through a token                                       */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately narrow. No owner id, no email, no timestamps beyond what a
 * reader needs, no counts of anything outside this notebook.
 */
export interface SharedNotebook {
  title: string;
  description: string | null;
  icon: string;
  color: string;
  updatedAt: Date;
  pages: SharedPageSummary[];
}

export interface SharedPageSummary {
  id: string;
  title: string;
  thumbnail: string | null;
  number: number;
}

export async function getSharedNotebook(
  token: string,
): Promise<SharedNotebook | null> {
  if (!token) return null;

  const [book] = await db
    .select({
      id: notebook.id,
      title: notebook.title,
      description: notebook.description,
      icon: notebook.icon,
      color: notebook.color,
      updatedAt: notebook.updatedAt,
    })
    .from(notebook)
    .where(
      and(eq(notebook.shareToken, token), eq(notebook.visibility, "link")),
    )
    .limit(1);

  if (!book) return null;

  const pages = await db
    .select({
      id: page.id,
      title: page.title,
      thumbnail: page.thumbnail,
    })
    .from(page)
    .where(and(eq(page.notebookId, book.id), eq(page.isDeleted, false)))
    .orderBy(asc(page.sortIndex));

  return {
    title: book.title,
    description: book.description,
    icon: book.icon,
    color: book.color,
    updatedAt: book.updatedAt,
    pages: pages.map((p, index) => ({ ...p, number: index + 1 })),
  };
}

export interface SharedPage {
  notebookTitle: string;
  notebookIcon: string;
  notebookColor: string;
  page: {
    id: string;
    title: string;
    paperStyle: PaperStyle;
  };
  document: {
    elements: CanvasElement[];
    appState: CanvasAppState;
  };
  assets: CanvasAsset[];
  index: number;
  total: number;
  previousPageId: string | null;
  nextPageId: string | null;
  pages: SharedPageSummary[];
}

/**
 * A single page, reachable only if the requested page actually belongs to the
 * notebook the token unlocks. Without that join a valid token for notebook A
 * would read any page id in the database.
 */
export async function getSharedPage(
  token: string,
  pageId: string,
): Promise<SharedPage | null> {
  if (!token || !pageId) return null;

  const [book] = await db
    .select({
      id: notebook.id,
      title: notebook.title,
      icon: notebook.icon,
      color: notebook.color,
    })
    .from(notebook)
    .where(
      and(eq(notebook.shareToken, token), eq(notebook.visibility, "link")),
    )
    .limit(1);

  if (!book) return null;

  const siblings = await db
    .select({
      id: page.id,
      title: page.title,
      thumbnail: page.thumbnail,
      paperStyle: page.paperStyle,
    })
    .from(page)
    .where(and(eq(page.notebookId, book.id), eq(page.isDeleted, false)))
    .orderBy(asc(page.sortIndex));

  const index = siblings.findIndex((p) => p.id === pageId);
  if (index === -1) return null; // page is not in this notebook

  const current = siblings[index];

  const [document] = await db
    .select({
      elements: pageDocument.elements,
      appState: pageDocument.appState,
    })
    .from(pageDocument)
    .where(eq(pageDocument.pageId, pageId))
    .limit(1);

  const assetRows = await db
    .select({
      id: pageAsset.id,
      mimeType: pageAsset.mimeType,
      bytes: pageAsset.bytes,
      createdAt: pageAsset.createdAt,
    })
    .from(pageAsset)
    .where(eq(pageAsset.pageId, pageId));

  return {
    notebookTitle: book.title,
    notebookIcon: book.icon,
    notebookColor: book.color,
    page: {
      id: current.id,
      title: current.title,
      paperStyle: current.paperStyle as PaperStyle,
    },
    document: {
      elements: document?.elements ?? [],
      appState: document?.appState ?? {},
    },
    assets: assetRows.map((row) => ({
      id: row.id,
      mimeType: row.mimeType,
      dataURL: `data:${row.mimeType};base64,${row.bytes.toString("base64")}`,
      createdAt: row.createdAt.getTime(),
    })),
    index,
    total: siblings.length,
    previousPageId: index > 0 ? siblings[index - 1].id : null,
    nextPageId: index < siblings.length - 1 ? siblings[index + 1].id : null,
    pages: siblings.map((p, i) => ({
      id: p.id,
      title: p.title,
      thumbnail: p.thumbnail,
      number: i + 1,
    })),
  };
}
