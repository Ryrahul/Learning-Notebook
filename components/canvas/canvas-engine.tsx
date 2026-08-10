"use client";

import * as React from "react";
import {
  Excalidraw,
  exportToBlob,
  getNonDeletedElements,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  BinaryFileData,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { InkPreset } from "@/lib/canvas/ink-presets";
import { useLatestRef } from "@/lib/react-utils";
import type {
  CanvasAppState,
  CanvasAsset,
  CanvasElement,
} from "@/lib/canvas/types";
import type {
  EngineHandle,
  EngineEvents,
  EngineTool,
  EngineViewport,
} from "@/lib/canvas/engine/types";

/**
 * The engine adapter — the ONLY module that knows the renderer is Excalidraw.
 *
 * Everything above this file talks to `EngineHandle`. The mapping in both
 * directions is deliberately narrow: we persist elements verbatim (so pressure
 * data, bindings and future element types survive a round trip losslessly) but
 * persist only the slice of view state that should actually come back on
 * reload.
 */

/** View state worth keeping. Everything else is transient UI noise. */
const PERSISTED_APP_STATE_KEYS = [
  "scrollX",
  "scrollY",
  "zoom",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemStrokeWidth",
  "currentItemOpacity",
  "currentItemRoughness",
  "currentItemFontSize",
  "currentItemFontFamily",
  "currentItemTextAlign",
  "currentItemFillStyle",
  "currentItemStrokeStyle",
  "currentItemArrowType",
  "currentItemRoundness",
] as const;

export interface CanvasEngineProps extends EngineEvents {
  initialElements: CanvasElement[];
  initialAppState: CanvasAppState;
  initialAssets: CanvasAsset[];
  theme: "light" | "dark";
  gridVisible: boolean;
  /** Rendered inside the engine's own layout (top-right). */
  topRightUI?: React.ReactNode;
  onReady?: (handle: EngineHandle) => void;
}

export function CanvasEngine({
  initialElements,
  initialAppState,
  initialAssets,
  theme,
  gridVisible,
  topRightUI,
  onChange,
  onViewportChange,
  onSelectionChange,
  onReady,
}: CanvasEngineProps) {
  const apiRef = React.useRef<ExcalidrawImperativeAPI | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Assets already known to the server; anything else is a pending upload.
  const knownAssetIds = React.useRef(new Set(initialAssets.map((a) => a.id)));
  const lastSelectionCount = React.useRef(-1);

  // Callbacks live in a ref so the imperative handle never goes stale without
  // forcing the whole engine to remount. Written in an effect rather than
  // during render — the engine only invokes them after mount.
  const events = useLatestRef({ onChange, onViewportChange, onSelectionChange });

  const buildHandle = React.useCallback(
    (api: ExcalidrawImperativeAPI): EngineHandle => ({
      getSnapshot() {
        const elements = api.getSceneElementsIncludingDeleted();
        const appState = api.getAppState();
        return {
          elements: elements as unknown as CanvasElement[],
          appState: pickAppState(appState),
          fileIds: collectFileIds(elements),
        };
      },

      getPendingAssets() {
        const files = api.getFiles();
        const referenced = new Set(
          collectFileIds(api.getSceneElementsIncludingDeleted()),
        );

        return Object.values(files)
          .filter(
            (file) =>
              referenced.has(file.id) && !knownAssetIds.current.has(file.id),
          )
          .map((file) => ({
            id: file.id as string,
            mimeType: file.mimeType as string,
            dataURL: file.dataURL as string,
          }));
      },

      setTool(tool: EngineTool) {
        api.setActiveTool({ type: tool } as Parameters<
          ExcalidrawImperativeAPI["setActiveTool"]
        >[0]);
      },

      applyInk(preset: InkPreset, color?: string) {
        api.setActiveTool({ type: "freedraw" });
        api.updateScene({
          appState: {
            currentItemStrokeWidth: preset.strokeWidth,
            currentItemOpacity: preset.opacity,
            currentItemRoughness: preset.roughness,
            currentItemStrokeColor: color ?? preset.defaultColor,
          },
        });
      },

      setStrokeColor(color: string) {
        api.updateScene({ appState: { currentItemStrokeColor: color } });
      },

      setStrokeWidth(width: number) {
        api.updateScene({ appState: { currentItemStrokeWidth: width } });
      },

      setOpacity(opacity: number) {
        api.updateScene({ appState: { currentItemOpacity: opacity } });
      },

      undo() {
        dispatchKey(containerRef.current, "z", { ctrl: true });
      },

      redo() {
        dispatchKey(containerRef.current, "z", { ctrl: true, shift: true });
      },

      zoomIn() {
        stepZoom(api, 1.2);
      },

      zoomOut() {
        stepZoom(api, 1 / 1.2);
      },

      resetZoom() {
        api.updateScene({ appState: { zoom: { value: 1 as never } } });
      },

      zoomToFit() {
        const elements = getNonDeletedElements(api.getSceneElements());
        if (elements.length === 0) {
          api.updateScene({ appState: { zoom: { value: 1 as never } } });
          return;
        }
        api.scrollToContent(elements, {
          fitToContent: true,
          animate: true,
          duration: 250,
        });
      },

      getViewport() {
        const state = api.getAppState();
        return {
          scrollX: state.scrollX,
          scrollY: state.scrollY,
          zoom: state.zoom.value,
        };
      },

      setGridVisible(visible: boolean) {
        api.updateScene({ appState: { gridModeEnabled: visible } });
      },

      focus() {
        containerRef.current
          ?.querySelector<HTMLElement>(".excalidraw-container, canvas")
          ?.focus();
      },

      replaceScene(elements: CanvasElement[], appState?: CanvasAppState) {
        api.updateScene({
          elements: elements as unknown as ExcalidrawElement[],
          ...(appState ? { appState: toEngineAppState(appState) } : {}),
        });
      },

      async exportThumbnail(options) {
        const elements = getNonDeletedElements(api.getSceneElements());
        if (elements.length === 0) return null;

        try {
          const blob = await exportToBlob({
            elements,
            appState: {
              ...api.getAppState(),
              exportBackground: true,
              viewBackgroundColor: options?.background ?? "#ffffff",
              exportWithDarkMode: false,
            },
            files: api.getFiles(),
            mimeType: "image/png",
            quality: 0.6,
            exportPadding: 24,
            getDimensions: (width: number, height: number) => {
              const target = options?.width ?? 420;
              const scale = Math.min(1, target / Math.max(width, 1));
              return { width: width * scale, height: height * scale, scale };
            },
          });
          return await blobToDataURL(blob);
        } catch (error) {
          // A thumbnail is a nicety; never let it surface as a save failure.
          console.warn("[canvas] thumbnail export failed", error);
          return null;
        }
      },
    }),
    [],
  );

  const handleApi = React.useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api;

      // Images loaded from the server are injected as engine files; elements
      // referencing them then resolve without a per-image request.
      if (initialAssets.length > 0) {
        api.addFiles(
          initialAssets.map(
            (asset) =>
              ({
                id: asset.id,
                mimeType: asset.mimeType,
                dataURL: asset.dataURL,
                created: asset.createdAt,
              }) as unknown as BinaryFileData,
          ),
        );
      }

      onReady?.(buildHandle(api));
    },
    [buildHandle, initialAssets, onReady],
  );

  return (
    <div ref={containerRef} className="size-full [&_.excalidraw]:!bg-transparent">
      <Excalidraw
        excalidrawAPI={handleApi}
        theme={theme}
        gridModeEnabled={gridVisible}
        objectsSnapModeEnabled
        initialData={{
          elements: initialElements as unknown as ExcalidrawElement[],
          appState: {
            ...toEngineAppState(initialAppState),
            // Our paper layer is painted behind the canvas, so the engine's
            // own background must not cover it.
            viewBackgroundColor: "transparent",
          },
          scrollToContent: false,
        }}
        UIOptions={{
          canvasActions: {
            // Replaced by our own chrome, or meaningless in a notebook where
            // the "file" is a page in a database.
            changeViewBackgroundColor: false,
            clearCanvas: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            export: false,
            saveAsImage: true,
          },
        }}
        renderTopRightUI={() => <>{topRightUI ?? null}</>}
        onChange={(elements, appState) => {
          events.current.onChange?.();

          const selected = Object.keys(appState.selectedElementIds ?? {}).length;
          if (selected !== lastSelectionCount.current) {
            lastSelectionCount.current = selected;
            events.current.onSelectionChange?.(selected);
          }
          void elements;
        }}
        onScrollChange={(scrollX, scrollY, zoom) => {
          events.current.onViewportChange?.({
            scrollX,
            scrollY,
            zoom: zoom.value,
          } satisfies EngineViewport);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mapping helpers                                                            */
/* -------------------------------------------------------------------------- */

function pickAppState(state: Record<string, unknown>): CanvasAppState {
  const result: Record<string, unknown> = {};
  for (const key of PERSISTED_APP_STATE_KEYS) {
    const value = state[key];
    if (value === undefined) continue;
    // Zoom is an object in the engine but a number in our schema.
    result[key] =
      key === "zoom"
        ? ((value as { value: number }).value ?? 1)
        : value;
  }
  return result as CanvasAppState;
}

function collectFileIds(elements: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const element of elements) {
    const fileId = (element as { fileId?: unknown }).fileId;
    if (typeof fileId === "string" && fileId) ids.add(fileId);
  }
  return [...ids];
}

/**
 * Our persisted view state -> the engine's appState.
 *
 * `zoom` is the only shape mismatch (a number for us, an object for the
 * engine), and `gridSize` is ours-only, so it is dropped here.
 */
function toEngineAppState(appState: CanvasAppState) {
  const { zoom, gridSize: _gridSize, ...rest } = appState;
  void _gridSize;
  // A partial appState is exactly what updateScene/initialData accept at
  // runtime, but the published type demands the full object.
  return {
    ...rest,
    ...(zoom !== undefined ? { zoom: { value: zoom } } : {}),
  } as unknown as Parameters<
    ExcalidrawImperativeAPI["updateScene"]
  >[0]["appState"];
}

function stepZoom(api: ExcalidrawImperativeAPI, factor: number) {
  const current = api.getAppState().zoom.value;
  const next = Math.min(30, Math.max(0.1, current * factor));
  api.updateScene({ appState: { zoom: { value: next as never } } });
}

/**
 * Undo/redo are keyboard-only in the engine's public API, so the toolbar
 * buttons replay the shortcut against the canvas container.
 */
function dispatchKey(
  container: HTMLElement | null,
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean } = {},
) {
  const target =
    container?.querySelector<HTMLElement>(".excalidraw canvas") ??
    container ??
    document.body;

  target.focus();
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const event = new KeyboardEvent("keydown", {
    key,
    code: `Key${key.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
    ctrlKey: modifiers.ctrl && !isMac,
    metaKey: modifiers.ctrl && isMac,
    shiftKey: modifiers.shift ?? false,
  });
  target.dispatchEvent(event);
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
