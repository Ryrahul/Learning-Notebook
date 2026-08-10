import type { InkPreset } from "@/lib/canvas/ink-presets";
import type { CanvasAppState, CanvasElement } from "@/lib/canvas/types";

/**
 * The contract the editor UI programs against.
 *
 * Nothing outside `lib/canvas/engine/` may import the rendering library. The
 * chrome, the toolbar, the autosave hook and the page shell all speak this
 * interface, so swapping the engine is a rewrite of the adapter rather than a
 * rewrite of the product.
 */

export type EngineTool =
  | "selection"
  | "hand"
  | "freedraw"
  | "eraser"
  | "text"
  | "image"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "laser"
  | "frame";

export interface EngineViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export interface EngineSnapshot {
  elements: CanvasElement[];
  appState: CanvasAppState;
  /** Asset ids referenced by the current scene. */
  fileIds: string[];
}

export interface EngineHandle {
  /** Full scene including deleted elements — what we persist. */
  getSnapshot(): EngineSnapshot;
  /** Newly added images that the server has not stored yet. */
  getPendingAssets(): { id: string; mimeType: string; dataURL: string }[];

  setTool(tool: EngineTool): void;
  applyInk(preset: InkPreset, color?: string): void;
  setStrokeColor(color: string): void;
  setStrokeWidth(width: number): void;
  setOpacity(opacity: number): void;

  undo(): void;
  redo(): void;

  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  zoomToFit(): void;

  getViewport(): EngineViewport;
  setGridVisible(visible: boolean): void;

  /** Focus the canvas so keyboard shortcuts reach the engine. */
  focus(): void;

  /** Replace the scene — used when restoring a local draft or a revision. */
  replaceScene(elements: CanvasElement[], appState?: CanvasAppState): void;

  /** PNG data URL for page thumbnails. Null when the page is empty. */
  exportThumbnail(options?: {
    width?: number;
    background?: string;
  }): Promise<string | null>;
}

export interface EngineEvents {
  /** Any scene mutation. Fires often — callers must debounce. */
  onChange?: () => void;
  /** Pan/zoom. Fires per frame — callers must not set React state here. */
  onViewportChange?: (viewport: EngineViewport) => void;
  /** Selection size, so chrome can enable/disable element actions. */
  onSelectionChange?: (count: number) => void;
}
