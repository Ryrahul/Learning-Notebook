import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { page, pageAsset } from "@/lib/db/schema";
import type { CanvasAsset } from "@/lib/canvas/types";

/**
 * Image/file storage.
 *
 * Bytes live in their own table rather than inline in the canvas JSON: a
 * base64 image inside `elements` would be re-serialised and re-written on
 * every single autosave. Here an image is written once and referenced by id.
 *
 * This module is the seam for object storage — moving to S3 means changing
 * `putAsset`/`getAssetBytes` and nothing else.
 */

export const MAX_ASSET_BYTES = 12 * 1024 * 1024; // 12 MB

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
]);

export function isAllowedMime(mimeType: string) {
  return ALLOWED_MIME.has(mimeType);
}

export async function putAsset(params: {
  userId: string;
  pageId: string;
  fileId: string;
  mimeType: string;
  bytes: Buffer;
  fileName?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isAllowedMime(params.mimeType)) {
    return { ok: false, reason: "Unsupported file type." };
  }
  if (params.bytes.byteLength > MAX_ASSET_BYTES) {
    return { ok: false, reason: "File is larger than 12 MB." };
  }

  const [owned] = await db
    .select({ id: page.id })
    .from(page)
    .where(and(eq(page.id, params.pageId), eq(page.ownerId, params.userId)))
    .limit(1);

  if (!owned) return { ok: false, reason: "Page not found." };

  // The canvas engine keys files by a content hash, so re-pasting the same
  // image is a no-op rather than a duplicate row.
  await db
    .insert(pageAsset)
    .values({
      id: params.fileId,
      pageId: params.pageId,
      ownerId: params.userId,
      mimeType: params.mimeType,
      byteSize: params.bytes.byteLength,
      bytes: params.bytes,
      fileName: params.fileName ?? null,
    })
    .onConflictDoNothing({ target: pageAsset.id });

  return { ok: true };
}

export async function getAssetBytes(userId: string, fileId: string) {
  const [row] = await db
    .select({
      bytes: pageAsset.bytes,
      mimeType: pageAsset.mimeType,
      byteSize: pageAsset.byteSize,
    })
    .from(pageAsset)
    .where(and(eq(pageAsset.id, fileId), eq(pageAsset.ownerId, userId)))
    .limit(1);

  return row ?? null;
}

/**
 * Load every asset a page references, as data URLs the engine can consume.
 *
 * Done in one query on page open rather than one request per image, because a
 * dense study page can easily hold a dozen screenshots.
 */
export async function loadPageAssets(
  userId: string,
  pageId: string,
): Promise<CanvasAsset[]> {
  const rows = await db
    .select({
      id: pageAsset.id,
      mimeType: pageAsset.mimeType,
      bytes: pageAsset.bytes,
      createdAt: pageAsset.createdAt,
    })
    .from(pageAsset)
    .where(and(eq(pageAsset.pageId, pageId), eq(pageAsset.ownerId, userId)));

  return rows.map((row) => ({
    id: row.id,
    mimeType: row.mimeType,
    dataURL: `data:${row.mimeType};base64,${row.bytes.toString("base64")}`,
    createdAt: row.createdAt.getTime(),
  }));
}

/** Which of these ids the server already has — lets the client upload only new ones. */
export async function knownAssetIds(
  userId: string,
  fileIds: string[],
): Promise<Set<string>> {
  if (fileIds.length === 0) return new Set();

  const rows = await db
    .select({ id: pageAsset.id })
    .from(pageAsset)
    .where(and(eq(pageAsset.ownerId, userId), inArray(pageAsset.id, fileIds)));

  return new Set(rows.map((r) => r.id));
}
