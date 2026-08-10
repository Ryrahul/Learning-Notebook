"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Loader2, Maximize, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { createPageAction, setPaperStyleAction } from "@/lib/actions/pages";
import { INK_PRESETS, type InkId } from "@/lib/canvas/ink-presets";
import type {
  CanvasAppState,
  CanvasAsset,
  CanvasElement,
  PaperStyle,
} from "@/lib/canvas/types";
import type { EngineHandle, EngineViewport } from "@/lib/canvas/engine/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { EditorTopbar } from "./editor-topbar";
import { InkToolbar } from "./ink-toolbar";
import { PageNavigator, type NavigatorPage } from "./page-navigator";
import { PaperLayer, type PaperLayerHandle } from "./paper-layer";
import { useAutosave } from "@/lib/canvas/use-autosave";
import { SaveStatusIndicator } from "./save-status";

/**
 * The engine is ~1MB and renders to a canvas — it cannot server-render, and it
 * has no business being in the dashboard bundle. Loading it here keeps the
 * cost on the one route that actually needs it.
 */
const CanvasEngine = dynamic(
  () => import("./canvas-engine").then((mod) => mod.CanvasEngine),
  {
    ssr: false,
    loading: () => (
      <div className="grid size-full place-items-center">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Opening page…
        </span>
      </div>
    ),
  },
);

export interface PageEditorProps {
  page: {
    id: string;
    title: string;
    notebookId: string;
    paperStyle: PaperStyle;
  };
  notebook: { id: string; title: string; icon: string; color: string };
  position: {
    index: number;
    total: number;
    previousPageId: string | null;
    nextPageId: string | null;
  };
  pages: NavigatorPage[];
  document: {
    elements: CanvasElement[];
    appState: CanvasAppState;
    version: number;
    updatedAt: string;
  };
  assets: CanvasAsset[];
}

export function PageEditor({
  page,
  notebook,
  position,
  pages,
  document: initialDocument,
  assets,
}: PageEditorProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  const engineRef = React.useRef<EngineHandle | null>(null);
  const paperRef = React.useRef<PaperLayerHandle | null>(null);

  const [engineReady, setEngineReady] = React.useState(false);
  const [navigatorOpen, setNavigatorOpen] = React.useState(false);
  const [paperStyle, setPaperStyle] = React.useState<PaperStyle>(
    page.paperStyle,
  );
  const [activeInk, setActiveInk] = React.useState<InkId | null>(null);
  const [strokeWidth, setStrokeWidth] = React.useState(2);
  const [zoomLabel, setZoomLabel] = React.useState("100%");

  // Each instrument remembers its own colour — switching to the highlighter
  // and back should not reset your pen.
  const [inkColors, setInkColors] = React.useState<Record<InkId, string>>(() => ({
    pencil: INK_PRESETS.pencil.defaultColor,
    pen: INK_PRESETS.pen.defaultColor,
    marker: INK_PRESETS.marker.defaultColor,
    highlighter: INK_PRESETS.highlighter.defaultColor,
  }));

  const autosave = useAutosave({
    pageId: page.id,
    notebookId: page.notebookId,
    initialVersion: initialDocument.version,
    initialUpdatedAt: initialDocument.updatedAt,
    getEngine: () => engineRef.current,
    thumbnailBackground: theme === "dark" ? "#17171a" : "#ffffff",
  });

  const { markDirty, flush, restoreDraft } = autosave;

  /* ---------------------------------------------------------------------- */
  /*  Engine wiring                                                          */
  /* ---------------------------------------------------------------------- */

  const handleReady = React.useCallback(
    (handle: EngineHandle) => {
      engineRef.current = handle;
      setEngineReady(true);
      paperRef.current?.update(handle.getViewport());
      void restoreDraft(handle);
    },
    [restoreDraft],
  );

  // Pan/zoom drives the paper directly through refs. Deliberately no state:
  // a re-render per frame while dragging is the difference between a canvas
  // that feels native and one that stutters.
  const handleViewportChange = React.useCallback((viewport: EngineViewport) => {
    paperRef.current?.update(viewport);
    const next = `${Math.round(viewport.zoom * 100)}%`;
    setZoomLabel((current) => (current === next ? current : next));
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Tools                                                                  */
  /* ---------------------------------------------------------------------- */

  const selectInk = React.useCallback(
    (id: InkId) => {
      const preset = INK_PRESETS[id];
      setActiveInk(id);
      setStrokeWidth(preset.strokeWidth);
      engineRef.current?.applyInk(preset, inkColors[id]);
      engineRef.current?.focus();
    },
    [inkColors],
  );

  const selectPointer = React.useCallback(() => {
    setActiveInk(null);
    engineRef.current?.setTool("selection");
    engineRef.current?.focus();
  }, []);

  const changeInkColor = React.useCallback(
    (id: InkId, color: string) => {
      setInkColors((current) => ({ ...current, [id]: color }));
      if (activeInk === id) engineRef.current?.setStrokeColor(color);
      else selectInk(id);
    },
    [activeInk, selectInk],
  );

  const changeStrokeWidth = React.useCallback((width: number) => {
    setStrokeWidth(width);
    engineRef.current?.setStrokeWidth(width);
  }, []);

  const changePaperStyle = React.useCallback(
    async (style: PaperStyle) => {
      setPaperStyle(style);
      const result = await setPaperStyleAction(
        page.id,
        page.notebookId,
        style,
      );
      if (!result.ok) toast.error(result.error ?? "Could not change paper.");
    },
    [page.id, page.notebookId],
  );

  /* ---------------------------------------------------------------------- */
  /*  Navigation                                                             */
  /* ---------------------------------------------------------------------- */

  const goToPage = React.useCallback(
    async (pageId: string) => {
      if (pageId === page.id) return;
      await flush();
      router.push(`/n/${page.notebookId}/p/${pageId}`);
    },
    [flush, page.id, page.notebookId, router],
  );

  const addPage = React.useCallback(async () => {
    await flush();
    const result = await createPageAction(page.notebookId, {
      afterPageId: page.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`/n/${page.notebookId}/p/${result.id}`);
  }, [flush, page.id, page.notebookId, router]);

  /* ---------------------------------------------------------------------- */
  /*  Keyboard shortcuts                                                     */
  /* ---------------------------------------------------------------------- */

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const mod = event.metaKey || event.ctrlKey;

      // Manual save — the app already autosaves, but muscle memory is real,
      // and it should never trigger the browser's save-page dialog.
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flush();
        return;
      }

      if (mod && event.key === "\\") {
        event.preventDefault();
        setNavigatorOpen((open) => !open);
        return;
      }

      // Page flipping, mirroring a physical notebook.
      if (event.altKey && event.key === "ArrowLeft" && position.previousPageId) {
        event.preventDefault();
        void goToPage(position.previousPageId);
        return;
      }
      if (event.altKey && event.key === "ArrowRight" && position.nextPageId) {
        event.preventDefault();
        void goToPage(position.nextPageId);
        return;
      }

      if (typing || mod || event.altKey) return;

      // Instrument shortcuts. The engine owns the rest (V, R, O, A, T, …).
      const inkByKey: Record<string, InkId> = {
        "1": "pencil",
        "2": "pen",
        "3": "marker",
        "4": "highlighter",
      };
      const ink = inkByKey[event.key];
      if (ink) {
        event.preventDefault();
        selectInk(ink);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flush, goToPage, position.nextPageId, position.previousPageId, selectInk]);

  /* ---------------------------------------------------------------------- */

  return (
    <div className="flex h-dvh flex-col">
      <EditorTopbar
        page={page}
        notebook={notebook}
        position={position}
        navigatorOpen={navigatorOpen}
        onToggleNavigator={() => setNavigatorOpen((open) => !open)}
        onBeforeLeave={flush}
        saveStatus={
          <SaveStatusIndicator
            status={autosave.status}
            savedAt={autosave.savedAt}
            onRetry={autosave.retryNow}
          />
        }
      />

      <div className="flex min-h-0 flex-1">
        {navigatorOpen && (
          <PageNavigator
            pages={pages}
            currentPageId={page.id}
            onSelect={goToPage}
            onCreate={addPage}
            onClose={() => setNavigatorOpen(false)}
          />
        )}

        <main className="relative min-w-0 flex-1">
          {/* Paper sits behind a transparent engine canvas. */}
          <PaperLayer ref={paperRef} style={paperStyle} theme={theme} />

          <div className="absolute inset-0">
            <CanvasEngine
              initialElements={initialDocument.elements}
              initialAppState={initialDocument.appState}
              initialAssets={assets}
              theme={theme}
              gridVisible={false}
              onReady={handleReady}
              onChange={markDirty}
              onViewportChange={handleViewportChange}
            />
          </div>

          {/* Our chrome floats above the engine. `pointer-events-none` on the
              wrapper keeps the canvas clickable everywhere between controls. */}
          <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
            {engineReady && (
              <InkToolbar
                activeInk={activeInk}
                inkColors={inkColors}
                strokeWidth={strokeWidth}
                paperStyle={paperStyle}
                onSelectInk={selectInk}
                onInkColor={changeInkColor}
                onStrokeWidth={changeStrokeWidth}
                onSelect={selectPointer}
                onUndo={() => engineRef.current?.undo()}
                onRedo={() => engineRef.current?.redo()}
                onPaperStyle={changePaperStyle}
              />
            )}
          </div>

          <div className="pointer-events-none absolute bottom-4 right-4 z-10">
            {engineReady && (
              <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border bg-surface-raised/95 p-1 shadow-float backdrop-blur-md">
                <Tooltip label="Zoom out">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom out"
                    onClick={() => engineRef.current?.zoomOut()}
                  >
                    <Minus />
                  </Button>
                </Tooltip>
                <button
                  onClick={() => engineRef.current?.resetZoom()}
                  className="min-w-14 rounded-md px-1 py-1 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                  title="Reset zoom to 100%"
                >
                  {zoomLabel}
                </button>
                <Tooltip label="Zoom in">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom in"
                    onClick={() => engineRef.current?.zoomIn()}
                  >
                    <Plus />
                  </Button>
                </Tooltip>
                <Tooltip label="Fit to content">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Fit to content"
                    onClick={() => engineRef.current?.zoomToFit()}
                  >
                    <Maximize />
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>

          <PageEdgeHint
            side="left"
            visible={Boolean(position.previousPageId)}
            onClick={() =>
              position.previousPageId && goToPage(position.previousPageId)
            }
          />
          <PageEdgeHint
            side="right"
            visible={Boolean(position.nextPageId)}
            onClick={() => position.nextPageId && goToPage(position.nextPageId)}
          />
        </main>
      </div>
    </div>
  );
}

/**
 * A thin hot zone at each edge that turns the page.
 *
 * Nearly invisible until hovered — the physical-notebook gesture, without
 * putting another button on screen.
 */
function PageEdgeHint({
  side,
  visible,
  onClick,
}: {
  side: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous page" : "Next page"}
      className={cn(
        "group absolute inset-y-0 z-10 w-6 opacity-0 transition-opacity hover:opacity-100",
        side === "left" ? "left-0" : "right-0",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 w-full",
          side === "left"
            ? "bg-gradient-to-r from-foreground/10 to-transparent"
            : "bg-gradient-to-l from-foreground/10 to-transparent",
        )}
      />
    </button>
  );
}
