/**
 * Ink presets.
 *
 * The engine has one freehand tool. A notebook needs four writing instruments
 * that behave differently, so each preset is a tuned bundle of stroke width,
 * opacity and edge quality that we push into the engine when selected.
 *
 * Highlighter in particular has no engine equivalent — it is a wide, very
 * translucent, hard-edged stroke, which is exactly what makes it read as
 * highlighting rather than drawing.
 */

export type InkId = "pencil" | "pen" | "marker" | "highlighter";

export interface InkPreset {
  id: InkId;
  label: string;
  shortcut: string;
  /** Scene-space stroke width. */
  strokeWidth: number;
  /** 0–100, matching the engine's scale. */
  opacity: number;
  /** The engine's stroke texture: "architect" is clean, "artist" is sketchy. */
  roughness: 0 | 1 | 2;
  /** Default ink colour; the colour picker overrides this per stroke. */
  defaultColor: string;
  /** Drawn beneath everything else, so highlighting never hides text. */
  sendToBack?: boolean;
  description: string;
}

export const INK_PRESETS: Record<InkId, InkPreset> = {
  pencil: {
    id: "pencil",
    label: "Pencil",
    shortcut: "1",
    strokeWidth: 1,
    opacity: 85,
    roughness: 1,
    defaultColor: "#4b5563",
    description: "Light, slightly rough — for working out ideas",
  },
  pen: {
    id: "pen",
    label: "Pen",
    shortcut: "2",
    strokeWidth: 2,
    opacity: 100,
    roughness: 0,
    defaultColor: "#1e1e1e",
    description: "Clean and opaque — for writing",
  },
  marker: {
    id: "marker",
    label: "Marker",
    shortcut: "3",
    strokeWidth: 4,
    opacity: 100,
    roughness: 0,
    defaultColor: "#e03131",
    description: "Thick and bold — for emphasis",
  },
  highlighter: {
    id: "highlighter",
    label: "Highlighter",
    shortcut: "4",
    strokeWidth: 16,
    opacity: 35,
    roughness: 0,
    defaultColor: "#fde047",
    sendToBack: true,
    description: "Wide and translucent — for marking up",
  },
};

export const INK_ORDER: InkId[] = ["pencil", "pen", "marker", "highlighter"];

/** Ink colours, chosen to stay legible on both paper and dark canvas. */
export const INK_COLORS = [
  "#1e1e1e",
  "#4b5563",
  "#1971c2",
  "#2f9e44",
  "#e03131",
  "#f08c00",
  "#9c36b5",
  "#0c8599",
];

export const HIGHLIGHTER_COLORS = [
  "#fde047",
  "#86efac",
  "#7dd3fc",
  "#fda4af",
  "#d8b4fe",
  "#fdba74",
];

/** Stroke widths offered in the toolbar, in scene units. */
export const STROKE_WIDTHS = [1, 2, 4, 8, 16] as const;
