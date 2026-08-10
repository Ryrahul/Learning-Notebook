import type { NotebookColor } from "@/lib/db/schema";

/**
 * Notebook cover palette.
 *
 * Written as literal class strings rather than composed at runtime because
 * Tailwind only ships classes it can see in source. Each cover gets a spine
 * gradient, a soft tint for badges, and a solid accent for the marker.
 */
export interface CoverTheme {
  label: string;
  /** Cover gradient, used on the notebook card. */
  cover: string;
  /** Darker spine down the left edge. */
  spine: string;
  /** Low-contrast tint for chips and page thumbnails. */
  tint: string;
  /** Solid colour for dots and small marks. */
  dot: string;
  /** Readable text colour on the tint. */
  text: string;
}

export const COVER_THEMES: Record<NotebookColor, CoverTheme> = {
  indigo: {
    label: "Indigo",
    cover: "bg-gradient-to-br from-indigo-500 to-indigo-700",
    spine: "bg-indigo-800",
    tint: "bg-indigo-500/12",
    dot: "bg-indigo-500",
    text: "text-indigo-600 dark:text-indigo-300",
  },
  violet: {
    label: "Violet",
    cover: "bg-gradient-to-br from-violet-500 to-purple-700",
    spine: "bg-purple-800",
    tint: "bg-violet-500/12",
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-300",
  },
  blue: {
    label: "Blue",
    cover: "bg-gradient-to-br from-sky-500 to-blue-700",
    spine: "bg-blue-800",
    tint: "bg-sky-500/12",
    dot: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-300",
  },
  teal: {
    label: "Teal",
    cover: "bg-gradient-to-br from-teal-500 to-cyan-700",
    spine: "bg-teal-800",
    tint: "bg-teal-500/12",
    dot: "bg-teal-500",
    text: "text-teal-600 dark:text-teal-300",
  },
  emerald: {
    label: "Emerald",
    cover: "bg-gradient-to-br from-emerald-500 to-green-700",
    spine: "bg-emerald-800",
    tint: "bg-emerald-500/12",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-300",
  },
  amber: {
    label: "Amber",
    cover: "bg-gradient-to-br from-amber-400 to-orange-600",
    spine: "bg-amber-700",
    tint: "bg-amber-500/12",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-300",
  },
  orange: {
    label: "Orange",
    cover: "bg-gradient-to-br from-orange-500 to-red-600",
    spine: "bg-orange-700",
    tint: "bg-orange-500/12",
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-300",
  },
  rose: {
    label: "Rose",
    cover: "bg-gradient-to-br from-rose-500 to-pink-700",
    spine: "bg-rose-800",
    tint: "bg-rose-500/12",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-300",
  },
  slate: {
    label: "Slate",
    cover: "bg-gradient-to-br from-slate-500 to-slate-700",
    spine: "bg-slate-800",
    tint: "bg-slate-500/12",
    dot: "bg-slate-500",
    text: "text-slate-600 dark:text-slate-300",
  },
};

export function coverTheme(color: string): CoverTheme {
  return COVER_THEMES[color as NotebookColor] ?? COVER_THEMES.indigo;
}

export const NOTEBOOK_ICONS = [
  "📓", "📘", "📗", "📕", "📙", "📔", "📚", "🧠",
  "💻", "🎨", "⚙️", "🧪", "📐", "🔬", "🗂️", "✏️",
  "🚀", "🧩", "📊", "🎯", "🌱", "🔐", "🗺️", "⚡",
];
