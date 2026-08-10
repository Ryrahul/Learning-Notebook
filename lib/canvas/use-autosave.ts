"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  clearDraft,
  draftIsRecoverable,
  readDraft,
  writeDraft,
} from "@/lib/canvas/draft-store";
import { documentFingerprint } from "@/lib/canvas/types";
import type { EngineHandle } from "@/lib/canvas/engine/types";
import type { CanvasAppState, CanvasElement } from "@/lib/canvas/types";
import { useLatestRef, useSyncedFrom } from "@/lib/react-utils";

/**
 * Autosave.
 *
 * ```
 *              ┌──────── change ────────┐
 *              ▼                        │
 * idle ──▶ dirty ──(quiet | ceiling | flush)──▶ saving ──▶ saved
 *              ▲                                   │
 *              └────────── error ◀── backoff ◀─────┘
 * ```
 *
 * Three properties matter more than anything else here:
 *
 *  1. **A save is never skipped.** The debounce alone would never fire during
 *     continuous drawing, so a hard ceiling guarantees the brief's "at least
 *     every ~30 seconds".
 *  2. **Work survives everything.** Changes are mirrored to IndexedDB within
 *     ~600ms regardless of network state, and offered back on reopen.
 *  3. **Nothing is clobbered silently.** Saves carry the version they were
 *     based on; a mismatch stops autosaving and asks the user, rather than
 *     overwriting another tab.
 */

const QUIET_MS = 1_200;
const CEILING_MS = 30_000;
const DRAFT_MS = 600;
const THUMBNAIL_EVERY_MS = 45_000;

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export type SaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

interface ServerDocument {
  elements: CanvasElement[];
  appState: CanvasAppState;
  version: number;
}

export interface UseAutosaveOptions {
  pageId: string;
  notebookId: string;
  initialVersion: number;
  initialUpdatedAt: string;
  getEngine: () => EngineHandle | null;
  thumbnailBackground: string;
}

export function useAutosave({
  pageId,
  notebookId,
  initialVersion,
  initialUpdatedAt,
  getEngine,
  thumbnailBackground,
}: UseAutosaveOptions) {
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(
    initialUpdatedAt ? new Date(initialUpdatedAt) : null,
  );

  const versionRef = React.useRef(initialVersion);
  const dirtyRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const pausedRef = React.useRef(false);

  const quietTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const ceilingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const attemptRef = React.useRef(0);
  /** Fingerprint of the last *saved* scene. */
  const lastFingerprint = React.useRef<string | null>(null);
  /** Fingerprint of the last scene we were notified about. */
  const lastSeen = React.useRef<string | null>(null);
  const lastThumbnailAt = React.useRef(0);
  const conflictRef = React.useRef<ServerDocument | null>(null);

  const thumbnailBgRef = useLatestRef(thumbnailBackground);

  // `performSave` retries itself on failure. Routing that through a ref keeps
  // the recursion out of the declaration, so the timer always calls the
  // current closure rather than capturing the first one.
  const performSaveRef = React.useRef<
    ((options?: { keepalive?: boolean }) => Promise<boolean>) | null
  >(null);

  const clearTimers = React.useCallback(() => {
    for (const timer of [quietTimer, ceilingTimer, retryTimer]) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Uploading assets                                                       */
  /* ---------------------------------------------------------------------- */

  const uploadPendingAssets = React.useCallback(
    async (engine: EngineHandle) => {
      const pending = engine.getPendingAssets();
      if (pending.length === 0) return;

      // Images must land before the document that references them, otherwise a
      // reload between the two writes shows a broken image.
      await Promise.all(
        pending.map(async (asset) => {
          try {
            const response = await fetch(`/api/pages/${pageId}/assets`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(asset),
            });
            if (!response.ok) {
              throw new Error(`Asset upload failed (${response.status})`);
            }
          } catch (error) {
            console.error("[autosave] asset upload failed", error);
            throw error;
          }
        }),
      );
    },
    [pageId],
  );

  /* ---------------------------------------------------------------------- */
  /*  The save itself                                                        */
  /* ---------------------------------------------------------------------- */

  const performSave = React.useCallback(
    async (options: { keepalive?: boolean } = {}): Promise<boolean> => {
      const engine = getEngine();
      if (!engine || pausedRef.current) return false;

      if (savingRef.current) return false;
      savingRef.current = true;
      clearTimers();

      const snapshot = engine.getSnapshot();
      const fingerprint = documentFingerprint(snapshot.elements);

      // Nothing actually changed — an engine "change" event that carried no
      // mutation costs us nothing.
      if (fingerprint === lastFingerprint.current) {
        savingRef.current = false;
        dirtyRef.current = false;
        setStatus((current) => (current === "dirty" ? "saved" : current));
        return true;
      }

      setStatus("saving");

      try {
        await uploadPendingAssets(engine);

        // Thumbnails are comparatively expensive, so they ride along
        // periodically rather than on every save.
        let thumbnail: string | null | undefined;
        const now = Date.now();
        if (now - lastThumbnailAt.current > THUMBNAIL_EVERY_MS) {
          lastThumbnailAt.current = now;
          thumbnail = await engine.exportThumbnail({
            width: 420,
            background: thumbnailBgRef.current,
          });
        }

        const response = await fetch(`/api/pages/${pageId}/document`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          keepalive: options.keepalive,
          body: JSON.stringify({
            elements: snapshot.elements,
            appState: snapshot.appState,
            baseVersion: versionRef.current,
            ...(thumbnail !== undefined ? { thumbnail } : {}),
          }),
        });

        if (response.status === 409) {
          const payload = (await response.json()) as {
            serverVersion: number;
            document: ServerDocument;
          };
          conflictRef.current = payload.document;
          // Stop writing until the user decides — the alternative is silently
          // destroying whatever the other tab did.
          pausedRef.current = true;
          savingRef.current = false;
          setStatus("conflict");
          await writeDraft({
            pageId,
            elements: snapshot.elements,
            appState: snapshot.appState,
            baseVersion: versionRef.current,
            savedAt: Date.now(),
            unsaved: true,
          });
          return false;
        }

        if (!response.ok) throw new Error(`Save failed (${response.status})`);

        const payload = (await response.json()) as {
          version: number;
          savedAt: string;
        };

        versionRef.current = payload.version;
        lastFingerprint.current = fingerprint;
        lastSeen.current = fingerprint;
        dirtyRef.current = false;
        attemptRef.current = 0;
        savingRef.current = false;

        setSavedAt(new Date(payload.savedAt));
        setStatus("saved");

        // The mirror is now redundant, but keep it as a cache marked saved.
        await writeDraft({
          pageId,
          elements: snapshot.elements,
          appState: snapshot.appState,
          baseVersion: payload.version,
          savedAt: Date.now(),
          unsaved: false,
        });

        return true;
      } catch (error) {
        console.error("[autosave] save failed", error);
        savingRef.current = false;
        setStatus("error");

        // The work is still safe locally; retry until the network returns.
        await writeDraft({
          pageId,
          elements: snapshot.elements,
          appState: snapshot.appState,
          baseVersion: versionRef.current,
          savedAt: Date.now(),
          unsaved: true,
        });

        attemptRef.current += 1;
        const delay = Math.min(
          BACKOFF_MAX_MS,
          BACKOFF_BASE_MS * 2 ** (attemptRef.current - 1),
        );
        retryTimer.current = setTimeout(() => {
          void performSaveRef.current?.();
        }, delay);

        return false;
      }
    },
    [clearTimers, getEngine, pageId, thumbnailBgRef, uploadPendingAssets],
  );

  React.useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  /* ---------------------------------------------------------------------- */
  /*  Scheduling                                                             */
  /* ---------------------------------------------------------------------- */

  const markDirty = React.useCallback(() => {
    if (pausedRef.current) return;

    const engine = getEngine();
    if (!engine) return;

    // The engine emits `onChange` for plenty of things that aren't edits —
    // cursor movement, selection, tool switches, its own mount. Acting on
    // those would peg the status at "Unsaved" from the moment the page opens
    // and, worse, would reset the debounce forever so the quiet window never
    // arrives and only the 30s ceiling ever saved.
    const fingerprint = documentFingerprint(engine.getSnapshot().elements);
    if (fingerprint === lastSeen.current) return;
    lastSeen.current = fingerprint;

    // Edited back to exactly what the server already has (undo, for example).
    if (fingerprint === lastFingerprint.current) {
      dirtyRef.current = false;
      clearTimers();
      setStatus((current) => (current === "saving" ? current : "saved"));
      return;
    }

    dirtyRef.current = true;
    setStatus((current) =>
      current === "saving" || current === "error" ? current : "dirty",
    );

    // Local mirror first, and on its own schedule — it must not depend on the
    // network being healthy.
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const engine = getEngine();
      if (!engine) return;
      const snapshot = engine.getSnapshot();
      void writeDraft({
        pageId,
        elements: snapshot.elements,
        appState: snapshot.appState,
        baseVersion: versionRef.current,
        savedAt: Date.now(),
        unsaved: true,
      });
    }, DRAFT_MS);

    // Debounce: save once the user pauses.
    if (quietTimer.current) clearTimeout(quietTimer.current);
    quietTimer.current = setTimeout(() => {
      void performSave();
    }, QUIET_MS);

    // Ceiling: during continuous drawing the quiet window never arrives, so
    // this is what actually guarantees a save.
    if (!ceilingTimer.current) {
      ceilingTimer.current = setTimeout(() => {
        ceilingTimer.current = null;
        if (dirtyRef.current) void performSave();
      }, CEILING_MS);
    }
  }, [clearTimers, getEngine, pageId, performSave]);

  const flush = React.useCallback(async () => {
    if (!dirtyRef.current || pausedRef.current) return;
    await performSave();
  }, [performSave]);

  const retryNow = React.useCallback(() => {
    attemptRef.current = 0;
    void performSave();
  }, [performSave]);

  /* ---------------------------------------------------------------------- */
  /*  Conflict resolution                                                    */
  /* ---------------------------------------------------------------------- */

  const keepMine = React.useCallback(async () => {
    const server = conflictRef.current;
    if (!server) return;
    // Adopt the server's version so our next write is accepted, then save.
    versionRef.current = server.version;
    conflictRef.current = null;
    pausedRef.current = false;
    lastFingerprint.current = null;
    lastSeen.current = null;
    await performSave();
  }, [performSave]);

  const takeTheirs = React.useCallback(() => {
    const server = conflictRef.current;
    const engine = getEngine();
    if (!server || !engine) return;

    engine.replaceScene(server.elements, server.appState);
    versionRef.current = server.version;
    conflictRef.current = null;
    pausedRef.current = false;
    dirtyRef.current = false;
    lastFingerprint.current = documentFingerprint(server.elements);
    lastSeen.current = lastFingerprint.current;
    setStatus("saved");
    void clearDraft(pageId);
  }, [getEngine, pageId]);

  React.useEffect(() => {
    if (status !== "conflict") return;
    toast.warning("This page changed somewhere else", {
      description:
        "Your edits are saved locally. Choose which version to keep.",
      duration: Infinity,
      id: `conflict-${pageId}`,
      action: { label: "Keep mine", onClick: () => void keepMine() },
      cancel: { label: "Load theirs", onClick: takeTheirs },
    });
  }, [status, pageId, keepMine, takeTheirs]);

  /* ---------------------------------------------------------------------- */
  /*  Draft restore                                                          */
  /* ---------------------------------------------------------------------- */

  const restoreDraft = React.useCallback(
    async (engine: EngineHandle) => {
      // The scene as loaded from the server is, by definition, already saved.
      const initial = documentFingerprint(engine.getSnapshot().elements);
      lastFingerprint.current = initial;
      lastSeen.current = initial;

      const draft = await readDraft(pageId);
      if (!draftIsRecoverable(draft, initialVersion, initialUpdatedAt)) return;

      toast.info("Unsaved changes recovered", {
        description:
          "This page had edits that never reached the server. Restore them?",
        duration: 15_000,
        action: {
          label: "Restore",
          onClick: () => {
            engine.replaceScene(draft.elements, draft.appState);
            dirtyRef.current = true;
            lastFingerprint.current = null;
            lastSeen.current = null;
            setStatus("dirty");
            void performSave();
          },
        },
        cancel: {
          label: "Discard",
          onClick: () => void clearDraft(pageId),
        },
      });
    },
    [initialUpdatedAt, initialVersion, pageId, performSave],
  );

  /* ---------------------------------------------------------------------- */
  /*  Lifecycle guards                                                       */
  /* ---------------------------------------------------------------------- */

  React.useEffect(() => {
    // Tab hidden or being torn down: `keepalive` lets the request outlive the
    // page, which is the only way a save survives a close.
    function onVisibility() {
      if (document.visibilityState === "hidden" && dirtyRef.current) {
        void performSave({ keepalive: true });
      }
    }
    function onPageHide() {
      if (dirtyRef.current) void performSave({ keepalive: true });
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (dirtyRef.current || savingRef.current) event.preventDefault();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [performSave]);

  // Navigating to another page in the editor reuses this hook instance, so
  // everything page-scoped has to be re-seeded.
  useSyncedFrom(pageId, () => {
    setStatus("idle");
    setSavedAt(initialUpdatedAt ? new Date(initialUpdatedAt) : null);
  });

  React.useEffect(() => {
    versionRef.current = initialVersion;
    dirtyRef.current = false;
    savingRef.current = false;
    pausedRef.current = false;
    conflictRef.current = null;
    attemptRef.current = 0;
    lastFingerprint.current = null;
    lastSeen.current = null;
    lastThumbnailAt.current = 0;
    toast.dismiss(`conflict-${pageId}`);

    return () => {
      clearTimers();
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [pageId, initialVersion, clearTimers]);

  return {
    status,
    savedAt,
    markDirty,
    flush,
    retryNow,
    restoreDraft,
    notebookId,
  };
}
