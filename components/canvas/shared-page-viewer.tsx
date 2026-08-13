"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Loader2,
  Maximize,
  Minus,
  NotebookPen,
  Plus,
} from "lucide-react";

import type {
  CanvasAppState,
  CanvasAsset,
  CanvasElement,
  PaperStyle,
} from "@/lib/canvas/types";
import type { EngineHandle, EngineViewport } from "@/lib/canvas/engine/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { PaperLayer, type PaperLayerHandle } from "./paper-layer";

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

interface NavigatorPage {
  id: string;
  title: string;
  thumbnail: string | null;
  number: number;
}

/**
 * Read-only canvas for a shared notebook.
 *
 * Shares the engine, the paper layer and the page-flip model with the editor,
 * but deliberately not the editor shell: there is no autosave, no ink toolbar,
 * no study-session heartbeat and no server mutation of any kind. A recipient
 * can read, pan, zoom and move between pages — nothing else.
 */
export function SharedPageViewer({
  token,
  signupEnabled,
  notebook,
  page,
  document: sharedDocument,
  assets,
  position,
  pages,
}: {
  token: string;
  /** Passed from the server: signup policy is server-only state. */
  signupEnabled: boolean;
  notebook: { title: string; icon: string; color: string };
  page: { id: string; title: string; paperStyle: PaperStyle };
  document: { elements: CanvasElement[]; appState: CanvasAppState };
  assets: CanvasAsset[];
  position: {
    index: number;
    total: number;
    previousPageId: string | null;
    nextPageId: string | null;
  };
  pages: NavigatorPage[];
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  const engineRef = React.useRef<EngineHandle | null>(null);
  const paperRef = React.useRef<PaperLayerHandle | null>(null);

  const [engineReady, setEngineReady] = React.useState(false);
  const [navigatorOpen, setNavigatorOpen] = React.useState(false);
  const [zoomLabel, setZoomLabel] = React.useState("100%");

  const handleReady = React.useCallback((handle: EngineHandle) => {
    engineRef.current = handle;
    setEngineReady(true);
    paperRef.current?.update(handle.getViewport());
  }, []);

  const handleViewportChange = React.useCallback((viewport: EngineViewport) => {
    paperRef.current?.update(viewport);
    const next = `${Math.round(viewport.zoom * 100)}%`;
    setZoomLabel((current) => (current === next ? current : next));
  }, []);

  // Page flipping with the keyboard, same gesture as the editor.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey) return;
      if (event.key === "ArrowLeft" && position.previousPageId) {
        event.preventDefault();
        router.push(`/share/${token}/p/${position.previousPageId}`);
      }
      if (event.key === "ArrowRight" && position.nextPageId) {
        event.preventDefault();
        router.push(`/share/${token}/p/${position.nextPageId}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, token, position.previousPageId, position.nextPageId]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-13 shrink-0 items-center gap-3 border-b border-border bg-surface/85 px-3 backdrop-blur-md">
        <Tooltip label="All pages">
          <Button
            variant={navigatorOpen ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Toggle page list"
            aria-pressed={navigatorOpen}
            onClick={() => setNavigatorOpen((open) => !open)}
          >
            <Layers />
          </Button>
        </Tooltip>

        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-base leading-none">
            {notebook.icon}
          </span>
          <Link
            href={`/share/${token}`}
            className="shrink-0 truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {notebook.title}
          </Link>
          <span className="shrink-0 text-muted-foreground/50" aria-hidden>
            /
          </span>
          <span className="min-w-0 truncate text-sm font-medium">
            {page.title}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
            <Eye />
            Read only
          </Badge>

          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
            <Tooltip label="Previous page" keys="⌥←">
              <Button
                asChild={Boolean(position.previousPageId)}
                variant="ghost"
                size="icon-sm"
                aria-label="Previous page"
                disabled={!position.previousPageId}
              >
                {position.previousPageId ? (
                  <Link href={`/share/${token}/p/${position.previousPageId}`}>
                    <ChevronLeft />
                  </Link>
                ) : (
                  <ChevronLeft />
                )}
              </Button>
            </Tooltip>
            <span className="px-1.5 text-xs tabular-nums text-muted-foreground">
              {position.index + 1} / {position.total}
            </span>
            <Tooltip label="Next page" keys="⌥→">
              <Button
                asChild={Boolean(position.nextPageId)}
                variant="ghost"
                size="icon-sm"
                aria-label="Next page"
                disabled={!position.nextPageId}
              >
                {position.nextPageId ? (
                  <Link href={`/share/${token}/p/${position.nextPageId}`}>
                    <ChevronRight />
                  </Link>
                ) : (
                  <ChevronRight />
                )}
              </Button>
            </Tooltip>
          </div>

          <ThemeToggle />

          {signupEnabled && (
            <Button asChild size="sm" variant="accent" className="hidden sm:flex">
              <Link href="/signup">
                <NotebookPen />
                Make your own
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {navigatorOpen && (
          <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface-muted/60">
            <p className="px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {position.total} pages
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {pages.map((item) => (
                <Link
                  key={item.id}
                  href={`/share/${token}/p/${item.id}`}
                  aria-current={item.id === page.id}
                  className={cn(
                    "mb-1 flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors",
                    item.id === page.id
                      ? "bg-surface shadow-sm"
                      : "hover:bg-surface/70",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded border bg-paper",
                      item.id === page.id ? "border-accent" : "border-border",
                    )}
                  >
                    {item.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnail}
                        alt=""
                        className="size-full object-cover object-top"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="size-full opacity-50"
                        style={{
                          backgroundImage:
                            "radial-gradient(circle, hsl(var(--border-strong)) 0.5px, transparent 0.5px)",
                          backgroundSize: "6px 6px",
                        }}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {item.title}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Page {item.number}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </aside>
        )}

        <main className="relative min-w-0 flex-1">
          <PaperLayer ref={paperRef} style={page.paperStyle} theme={theme} />

          <div className="absolute inset-0">
            <CanvasEngine
              initialElements={sharedDocument.elements}
              initialAppState={sharedDocument.appState}
              initialAssets={assets}
              theme={theme}
              gridVisible={false}
              viewMode
              onReady={handleReady}
              onViewportChange={handleViewportChange}
            />
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
        </main>
      </div>
    </div>
  );
}
