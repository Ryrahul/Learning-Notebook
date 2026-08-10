import type { PaperStyle } from "@/lib/canvas/types";

/**
 * Paper backgrounds.
 *
 * This is the single biggest signal that a page is a notebook page and not a
 * whiteboard. The ruling is drawn by us, *behind* a transparent engine canvas,
 * and kept in lockstep with pan and zoom so it behaves like the surface the
 * ink sits on rather than a static backdrop.
 *
 * Engine transform (verified against the bundled types):
 *     viewport = (scene + scroll) * zoom + offset
 *
 * so a pattern with scene-space period P repeats every `P * zoom` on screen,
 * offset by `scrollX * zoom`.
 */

export interface PaperDescriptor {
  label: string;
  /** Pattern period in scene units. */
  spacing: number;
  /** Builds the repeating layer at a given on-screen period, in px. */
  background: (period: number, ink: string) => string;
  /** Line-only papers scroll vertically but not horizontally. */
  axis: "both" | "vertical" | "none";
}

export const PAPER_STYLE_ORDER: PaperStyle[] = [
  "dotted",
  "grid",
  "ruled",
  "plain",
];

export const PAPERS: Record<PaperStyle, PaperDescriptor> = {
  plain: {
    label: "Plain",
    spacing: 0,
    axis: "none",
    background: () => "none",
  },
  dotted: {
    label: "Dotted",
    spacing: 20,
    axis: "both",
    background: (period, ink) =>
      `radial-gradient(circle at ${period / 2}px ${period / 2}px, ${ink} ${dotRadius(period)}px, transparent ${dotRadius(period)}px)`,
  },
  grid: {
    label: "Grid",
    spacing: 20,
    axis: "both",
    background: (period, ink) =>
      `linear-gradient(to right, ${ink} 1px, transparent 1px), linear-gradient(to bottom, ${ink} 1px, transparent 1px)`,
  },
  ruled: {
    label: "Ruled",
    spacing: 28,
    axis: "vertical",
    background: (period, ink) =>
      `linear-gradient(to bottom, transparent ${period - 1}px, ${ink} ${period - 1}px)`,
  },
};

/** Dots shrink slightly when zoomed out so the page doesn't turn grey. */
function dotRadius(period: number) {
  return Math.max(0.5, Math.min(1.4, period / 18));
}

export interface PaperViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export interface PaperLayerStyle {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
}

/**
 * Compute the CSS for the paper layer at a given viewport.
 *
 * Returns plain style values rather than touching the DOM so this stays
 * testable; the caller writes them to a ref inside rAF, never through React
 * state — a re-render per pan frame would make the canvas stutter.
 */
export function paperLayerStyle(
  style: PaperStyle,
  viewport: PaperViewport,
  ink: string,
): PaperLayerStyle {
  const paper = PAPERS[style] ?? PAPERS.dotted;

  if (paper.spacing === 0) {
    return {
      backgroundImage: "none",
      backgroundSize: "auto",
      backgroundPosition: "0 0",
    };
  }

  const zoom = viewport.zoom || 1;
  const period = paper.spacing * zoom;

  // Below a couple of pixels the ruling turns into noise; drop it instead.
  if (period < 4) {
    return {
      backgroundImage: "none",
      backgroundSize: "auto",
      backgroundPosition: "0 0",
    };
  }

  const offsetX = paper.axis === "both" ? mod(viewport.scrollX * zoom, period) : 0;
  const offsetY = mod(viewport.scrollY * zoom, period);

  return {
    backgroundImage: paper.background(period, ink),
    backgroundSize: `${period}px ${period}px`,
    backgroundPosition: `${offsetX}px ${offsetY}px`,
  };
}

/** True modulo — JS `%` keeps the sign, which tears the pattern when panning. */
function mod(value: number, period: number) {
  return ((value % period) + period) % period;
}

/** Ruling colour, dialled per theme so it guides without competing with ink. */
export function paperInk(theme: "light" | "dark") {
  return theme === "dark" ? "rgba(226,232,240,0.13)" : "rgba(23,23,23,0.14)";
}

/** The page surface itself. */
export function paperSurface(theme: "light" | "dark") {
  return theme === "dark" ? "#17171a" : "#fdfcfa";
}
