/**
 * Canvas types we own.
 *
 * These are deliberately *ours*, not the rendering engine's. The database, the
 * services and the API all speak this vocabulary; only `lib/canvas/engine/*`
 * knows that the engine underneath happens to be Excalidraw. Replacing the
 * engine means rewriting the mappers, not migrating the schema.
 */

export const PAPER_STYLES = ["plain", "dotted", "grid", "ruled"] as const;
export type PaperStyle = (typeof PAPER_STYLES)[number];

/**
 * A single object on the page: a stroke, a shape, a text run, an image.
 *
 * Structurally typed rather than exhaustively enumerated — the engine owns
 * dozens of per-type fields and mirroring them here would be a maintenance
 * tax with no payoff. The fields we actually read are named; the rest ride
 * along losslessly, which is what keeps freehand pressure data and future
 * element types intact through a round-trip.
 */
export interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  /** Bumped by the engine on every mutation — our cheap dirty check. */
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  /** Present on text elements; the source for search extraction. */
  text?: string;
  /** Present on image elements; keys into `page_asset`. */
  fileId?: string | null;
  containerId?: string | null;
  [key: string]: unknown;
}

/**
 * The slice of view/tool state worth persisting.
 *
 * Explicitly *not* the engine's full appState — that contains transient junk
 * (cursor position, open menus, selection, collaborators) which would make
 * every save a diff and every reload a surprise.
 */
export interface CanvasAppState {
  scrollX?: number;
  scrollY?: number;
  zoom?: number;
  viewBackgroundColor?: string;
  gridSize?: number | null;
  [key: string]: unknown;
}

/** Current serialisation version; bump when the shape below changes. */
export const CANVAS_SCHEMA_VERSION = 1;

export interface CanvasDocument {
  schemaVersion: number;
  elements: CanvasElement[];
  appState: CanvasAppState;
}

/** An image/file referenced by an element, resolved for the engine. */
export interface CanvasAsset {
  id: string;
  mimeType: string;
  dataURL: string;
  createdAt: number;
}

export function emptyCanvasDocument(): CanvasDocument {
  return {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    elements: [],
    appState: {},
  };
}

/* -------------------------------------------------------------------------- */
/*  Text extraction — feeds search and, later, AI summarisation               */
/* -------------------------------------------------------------------------- */

const MAX_EXTRACTED_TEXT = 20_000;

/**
 * Flatten every text run on the page into one searchable string, in reading
 * order (top-to-bottom, then left-to-right) so excerpts read naturally.
 */
export function extractText(elements: CanvasElement[]): string {
  const runs = elements
    .filter(
      (el) =>
        !el.isDeleted &&
        typeof el.text === "string" &&
        (el.text as string).trim().length > 0,
    )
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((el) => (el.text as string).trim());

  const joined = runs.join("\n");
  return joined.length > MAX_EXTRACTED_TEXT
    ? joined.slice(0, MAX_EXTRACTED_TEXT)
    : joined;
}

/** Every asset id currently referenced by a live element. */
export function referencedFileIds(elements: CanvasElement[]): string[] {
  const ids = new Set<string>();
  for (const el of elements) {
    if (!el.isDeleted && typeof el.fileId === "string" && el.fileId) {
      ids.add(el.fileId);
    }
  }
  return [...ids];
}

/**
 * Cheap change detector. The engine bumps `version` on every element mutation,
 * so summing versions catches edits, and length catches add/remove. Lets us
 * skip the wire entirely when a "change" event carried no actual change.
 */
export function documentFingerprint(elements: CanvasElement[]): string {
  let versionSum = 0;
  let live = 0;
  for (const el of elements) {
    versionSum += el.version ?? 0;
    if (!el.isDeleted) live += 1;
  }
  return `${elements.length}:${live}:${versionSum}`;
}
