"use client";

import * as React from "react";
import {
  Highlighter,
  MousePointer2,
  PaintBucket,
  Pen,
  Pencil,
  Redo2,
  Undo2,
} from "lucide-react";

import {
  HIGHLIGHTER_COLORS,
  INK_COLORS,
  INK_ORDER,
  INK_PRESETS,
  STROKE_WIDTHS,
  type InkId,
} from "@/lib/canvas/ink-presets";
import { PAPERS, PAPER_STYLE_ORDER } from "@/lib/canvas/paper";
import type { PaperStyle } from "@/lib/canvas/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/primitives";

const INK_ICONS: Record<InkId, React.ElementType> = {
  pencil: Pencil,
  pen: Pen,
  marker: PaintBucket,
  highlighter: Highlighter,
};

export interface InkToolbarProps {
  activeInk: InkId | null;
  inkColors: Record<InkId, string>;
  strokeWidth: number;
  paperStyle: PaperStyle;
  onSelectInk: (ink: InkId) => void;
  onInkColor: (ink: InkId, color: string) => void;
  onStrokeWidth: (width: number) => void;
  onSelect: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPaperStyle: (style: PaperStyle) => void;
}

/**
 * The writing-instrument rail.
 *
 * The engine's own toolbar (shapes, text, images, eraser, selection) stays
 * where it is — it is genuinely good and re-implementing it would be waste.
 * What it does *not* have is the notion of different pens, so that is what
 * this adds: pencil, pen, marker and highlighter as distinct instruments with
 * their own weight, opacity and remembered colour.
 */
export function InkToolbar({
  activeInk,
  inkColors,
  strokeWidth,
  paperStyle,
  onSelectInk,
  onInkColor,
  onStrokeWidth,
  onSelect,
  onUndo,
  onRedo,
  onPaperStyle,
}: InkToolbarProps) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface-raised/95 p-1.5 shadow-float backdrop-blur-md">
      <Tooltip label="Select" keys="V" side="right">
        <Button
          variant={activeInk === null ? "secondary" : "ghost"}
          size="icon"
          onClick={onSelect}
          aria-label="Select tool"
          aria-pressed={activeInk === null}
        >
          <MousePointer2 />
        </Button>
      </Tooltip>

      <Separator className="my-0.5 w-6" />

      {INK_ORDER.map((id) => {
        const preset = INK_PRESETS[id];
        const Icon = INK_ICONS[id];
        const active = activeInk === id;
        const color = inkColors[id];

        return (
          <Popover key={id}>
            <Tooltip
              label={
                <span className="flex flex-col">
                  <span>{preset.label}</span>
                  <span className="text-background/70">
                    {preset.description}
                  </span>
                </span>
              }
              keys={preset.shortcut}
              side="right"
            >
              {/* Click selects the instrument; the caret opens its settings. */}
              <button
                onClick={() => onSelectInk(id)}
                onContextMenu={(event) => event.preventDefault()}
                aria-label={preset.label}
                aria-pressed={active}
                className={cn(
                  "relative grid size-9 place-items-center rounded-lg transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-foreground/75 hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span
                  className="absolute bottom-1 h-1 w-4 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </button>
            </Tooltip>

            <PopoverTrigger asChild>
              <button
                aria-label={`${preset.label} settings`}
                className={cn(
                  "h-1.5 w-6 rounded-full transition-colors",
                  active ? "bg-border-strong" : "bg-transparent hover:bg-border",
                )}
              />
            </PopoverTrigger>

            <PopoverContent side="right" align="start" className="w-56 space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-medium">{preset.label} colour</p>
                <div className="flex flex-wrap gap-1.5">
                  {(id === "highlighter"
                    ? HIGHLIGHTER_COLORS
                    : INK_COLORS
                  ).map((option) => (
                    <button
                      key={option}
                      onClick={() => onInkColor(id, option)}
                      aria-label={option}
                      className={cn(
                        "size-6 rounded-full border border-black/10 transition-transform hover:scale-110",
                        color === option &&
                          "ring-2 ring-foreground ring-offset-2 ring-offset-surface-raised",
                      )}
                      style={{ backgroundColor: option }}
                    />
                  ))}
                  <label
                    className="grid size-6 cursor-pointer place-items-center rounded-full border border-dashed border-border-strong text-[10px]"
                    title="Custom colour"
                  >
                    +
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => onInkColor(id, event.target.value)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium">Stroke width</p>
                <div className="flex items-center gap-1.5">
                  {STROKE_WIDTHS.map((width) => (
                    <button
                      key={width}
                      onClick={() => onStrokeWidth(width)}
                      aria-label={`Width ${width}`}
                      aria-pressed={strokeWidth === width}
                      className={cn(
                        "grid h-7 flex-1 place-items-center rounded-md transition-colors",
                        strokeWidth === width
                          ? "bg-secondary"
                          : "hover:bg-surface-muted",
                      )}
                    >
                      <span
                        className="rounded-full bg-foreground"
                        style={{
                          width: `${Math.min(18, 4 + width)}px`,
                          height: `${Math.max(1, Math.min(7, width / 2))}px`,
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        );
      })}

      <Separator className="my-0.5 w-6" />

      <Popover>
        <Tooltip label="Paper" side="right">
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Paper style">
              <PaperIcon style={paperStyle} />
            </Button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent side="right" align="start" className="w-44">
          <p className="mb-2 text-xs font-medium">Paper</p>
          <div className="grid grid-cols-2 gap-2">
            {PAPER_STYLE_ORDER.map((style) => (
              <button
                key={style}
                onClick={() => onPaperStyle(style)}
                aria-pressed={paperStyle === style}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[11px] transition-colors",
                  paperStyle === style
                    ? "border-accent bg-accent-soft"
                    : "border-border hover:bg-surface-muted",
                )}
              >
                <PaperSwatch style={style} />
                {PAPERS[style].label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Separator className="my-0.5 w-6" />

      <Tooltip label="Undo" keys="⌘Z" side="right">
        <Button variant="ghost" size="icon" onClick={onUndo} aria-label="Undo">
          <Undo2 />
        </Button>
      </Tooltip>
      <Tooltip label="Redo" keys="⌘⇧Z" side="right">
        <Button variant="ghost" size="icon" onClick={onRedo} aria-label="Redo">
          <Redo2 />
        </Button>
      </Tooltip>
    </div>
  );
}

function PaperSwatch({ style }: { style: PaperStyle }) {
  return (
    <span
      className="block h-8 w-full rounded border border-border bg-paper"
      style={swatchStyle(style)}
    />
  );
}

function PaperIcon({ style }: { style: PaperStyle }) {
  return (
    <span
      className="block size-4 rounded-[3px] border border-current/40"
      style={swatchStyle(style)}
    />
  );
}

function swatchStyle(style: PaperStyle): React.CSSProperties {
  const ink = "hsl(var(--border-strong))";
  switch (style) {
    case "dotted":
      return {
        backgroundImage: `radial-gradient(circle, ${ink} 1px, transparent 1px)`,
        backgroundSize: "6px 6px",
      };
    case "grid":
      return {
        backgroundImage: `linear-gradient(to right, ${ink} 1px, transparent 1px), linear-gradient(to bottom, ${ink} 1px, transparent 1px)`,
        backgroundSize: "6px 6px",
      };
    case "ruled":
      return {
        backgroundImage: `linear-gradient(to bottom, transparent 5px, ${ink} 5px)`,
        backgroundSize: "6px 6px",
      };
    default:
      return {};
  }
}
