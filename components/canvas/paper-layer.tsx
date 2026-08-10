"use client";

import * as React from "react";

import {
  paperInk,
  paperLayerStyle,
  paperSurface,
  type PaperViewport,
} from "@/lib/canvas/paper";
import type { PaperStyle } from "@/lib/canvas/types";

export interface PaperLayerHandle {
  /** Called on every pan/zoom frame. Must not trigger a React render. */
  update(viewport: PaperViewport): void;
}

/**
 * The ruled/dotted/grid surface the ink sits on.
 *
 * Rendered beneath a transparent engine canvas and repositioned imperatively:
 * `update()` writes straight to the element's style inside a single rAF.
 * Routing pan through React state instead would re-render the tree ~60 times a
 * second while dragging, which is exactly the stutter this design avoids.
 */
export const PaperLayer = React.forwardRef<
  PaperLayerHandle,
  { style: PaperStyle; theme: "light" | "dark" }
>(function PaperLayer({ style, theme }, ref) {
  const nodeRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const pendingRef = React.useRef<PaperViewport>({
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
  });

  // Read in the rAF callback, so a style/theme change mid-pan is picked up
  // without re-subscribing anything.
  const configRef = React.useRef({ style, theme });
  configRef.current = { style, theme };

  const paint = React.useCallback(() => {
    frameRef.current = null;
    const node = nodeRef.current;
    if (!node) return;

    const { style: paperStyle, theme: paperTheme } = configRef.current;
    const next = paperLayerStyle(
      paperStyle,
      pendingRef.current,
      paperInk(paperTheme),
    );

    node.style.backgroundImage = next.backgroundImage;
    node.style.backgroundSize = next.backgroundSize;
    node.style.backgroundPosition = next.backgroundPosition;
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      update(viewport: PaperViewport) {
        pendingRef.current = viewport;
        // Coalesce: many scroll events per frame collapse into one paint.
        if (frameRef.current === null) {
          frameRef.current = requestAnimationFrame(paint);
        }
      },
    }),
    [paint],
  );

  // Repaint when the paper style or theme changes.
  React.useEffect(() => {
    paint();
  }, [style, theme, paint]);

  React.useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ backgroundColor: paperSurface(theme) }}
      aria-hidden
    >
      <div ref={nodeRef} className="absolute inset-0" />
      {/* Faint vignette so the page reads as a surface with edges. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            theme === "dark"
              ? "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.25) 100%)"
              : "radial-gradient(ellipse at center, transparent 60%, rgba(120,110,95,0.07) 100%)",
        }}
      />
    </div>
  );
});
