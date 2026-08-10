"use client";

import * as React from "react";
import { Plus, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface NavigatorPage {
  id: string;
  title: string;
  thumbnail: string | null;
  number: number;
}

/**
 * The page navigator — the spine of the notebook.
 *
 * Virtualised past a threshold: a notebook is explicitly expected to hold
 * hundreds of pages, and mounting hundreds of thumbnails would make opening
 * the navigator janky. Below the threshold, plain rendering keeps it simple.
 */
const VIRTUALIZE_ABOVE = 60;
const ROW_HEIGHT = 92;
const OVERSCAN = 6;

export function PageNavigator({
  pages,
  currentPageId,
  onSelect,
  onCreate,
  onClose,
}: {
  pages: NavigatorPage[];
  currentPageId: string;
  onSelect: (pageId: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return pages;
    return pages.filter((page) => page.title.toLowerCase().includes(term));
  }, [pages, query]);

  const virtualize = filtered.length > VIRTUALIZE_ABOVE;

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    setViewportHeight(node.clientHeight);

    const observer = new ResizeObserver(() =>
      setViewportHeight(node.clientHeight),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Bring the open page into view when the navigator mounts.
  React.useEffect(() => {
    const index = filtered.findIndex((page) => page.id === currentPageId);
    if (index < 0 || !scrollRef.current) return;
    scrollRef.current.scrollTop = Math.max(
      0,
      index * ROW_HEIGHT - scrollRef.current.clientHeight / 2,
    );
    // Only on mount / page change, not on every filter keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageId]);

  const start = virtualize
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const end = virtualize
    ? Math.min(
        filtered.length,
        Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
      )
    : filtered.length;

  const visible = filtered.slice(start, end);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface-muted/60">
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Pages
        </span>
        <span className="text-xs text-muted-foreground/70">
          {filtered.length}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={onClose}
          aria-label="Hide page navigator"
        >
          <X />
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find page…"
            aria-label="Find page"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          if (virtualize) setScrollTop(event.currentTarget.scrollTop);
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3"
      >
        {filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No page matches “{query}”.
          </p>
        ) : (
          <div
            style={
              virtualize
                ? { height: filtered.length * ROW_HEIGHT, position: "relative" }
                : undefined
            }
          >
            <div
              style={
                virtualize
                  ? {
                      position: "absolute",
                      top: start * ROW_HEIGHT,
                      left: 0,
                      right: 0,
                    }
                  : undefined
              }
            >
              {visible.map((page) => (
                <button
                  key={page.id}
                  onClick={() => onSelect(page.id)}
                  aria-current={page.id === currentPageId}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors",
                    page.id === currentPageId
                      ? "bg-surface shadow-sm"
                      : "hover:bg-surface/70",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded border bg-paper",
                      page.id === currentPageId
                        ? "border-accent"
                        : "border-border",
                    )}
                  >
                    {page.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={page.thumbnail}
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
                      {page.title}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Page {page.number}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Button variant="outline" size="sm" className="w-full" onClick={onCreate}>
          <Plus />
          New page
        </Button>
      </div>
    </aside>
  );
}
