"use client";

import { del, get, set } from "idb-keyval";

import type { CanvasAppState, CanvasElement } from "@/lib/canvas/types";

/**
 * Local draft mirror.
 *
 * Every change is written to IndexedDB independently of the network. This is
 * the safety net behind the brief's hardest requirement — a crash, a closed
 * laptop, a dead connection or a failed deploy must not cost the user their
 * work. On reopening a page we compare the local draft against what the
 * server returned and offer to restore anything newer.
 *
 * IndexedDB rather than localStorage: canvases are megabytes, localStorage is
 * a synchronous ~5MB string store and would block the main thread mid-stroke.
 */

const KEY_PREFIX = "notebook:draft:";

export interface LocalDraft {
  pageId: string;
  elements: CanvasElement[];
  appState: CanvasAppState;
  /** Server version this draft was based on. */
  baseVersion: number;
  savedAt: number;
  /** False once the draft has been confirmed saved to the server. */
  unsaved: boolean;
}

function keyFor(pageId: string) {
  return `${KEY_PREFIX}${pageId}`;
}

export async function writeDraft(draft: LocalDraft): Promise<void> {
  try {
    await set(keyFor(draft.pageId), draft);
  } catch (error) {
    // A failed local mirror must never interrupt drawing.
    console.warn("[draft] write failed", error);
  }
}

export async function readDraft(pageId: string): Promise<LocalDraft | null> {
  try {
    return (await get<LocalDraft>(keyFor(pageId))) ?? null;
  } catch (error) {
    console.warn("[draft] read failed", error);
    return null;
  }
}

export async function clearDraft(pageId: string): Promise<void> {
  try {
    await del(keyFor(pageId));
  } catch (error) {
    console.warn("[draft] clear failed", error);
  }
}

/**
 * Should we offer to restore this draft?
 *
 * Only when it holds work the server never acknowledged. A draft that was
 * successfully saved is just a cache and gets ignored.
 */
export function draftIsRecoverable(
  draft: LocalDraft | null,
  serverVersion: number,
  serverUpdatedAt: string,
): draft is LocalDraft {
  if (!draft || !draft.unsaved) return false;

  // The draft was based on a version the server has since moved past — the
  // work it contains may already be there, or may have been superseded.
  if (draft.baseVersion < serverVersion) {
    return draft.savedAt > new Date(serverUpdatedAt).getTime();
  }

  return true;
}
