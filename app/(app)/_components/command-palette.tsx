"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  FileText,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NewNotebookDialog } from "./new-notebook-dialog";

const OPEN_EVENT = "notebook:open-command-palette";

/** Lets any component (sidebar button, shortcut) open the palette. */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

interface QuickFindResults {
  notebooks: { id: string; title: string; icon: string; color: string }[];
  pages: {
    id: string;
    title: string;
    notebookId: string;
    notebookTitle: string;
    notebookIcon: string;
  }[];
}

const EMPTY: QuickFindResults = { notebooks: [], pages: [] };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<QuickFindResults>(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    function onOpen() {
      setOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
    }
  }, [open]);

  // Debounced type-ahead. The AbortController matters: without it a slow
  // early request can land after a fast later one and show stale results.
  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/quick-find?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search failed");
        setResults((await response.json()) as QuickFindResults);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults(EMPTY);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 140);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const hasResults =
    results.notebooks.length > 0 || results.pages.length > 0;
  const trimmed = query.trim();

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showClose={false}
          className="top-[18%] max-w-xl translate-y-0 overflow-hidden p-0"
          aria-label="Command palette"
        >
          {/* cmdk does its own filtering; ours is server-side, so disable it. */}
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder="Search notebooks and pages, or jump to…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              />
              {loading && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              )}
              <Kbd>esc</Kbd>
            </div>

            <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
              {trimmed && !loading && !hasResults && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nothing matches “{trimmed}”.
                </p>
              )}

              {!trimmed && (
                <Command.Group
                  heading="Jump to"
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  <Item onSelect={() => go("/dashboard")} icon={LayoutGrid}>
                    All notebooks
                  </Item>
                  <Item onSelect={() => go("/activity")} icon={TrendingUp}>
                    Study progress
                  </Item>
                  <Item onSelect={() => go("/search")} icon={Search}>
                    Full search
                  </Item>
                  <Item
                    onSelect={() => {
                      setOpen(false);
                      setCreating(true);
                    }}
                    icon={Plus}
                  >
                    New notebook
                  </Item>
                </Command.Group>
              )}

              {results.notebooks.length > 0 && (
                <Command.Group
                  heading="Notebooks"
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {results.notebooks.map((nb) => (
                    <Item
                      key={nb.id}
                      value={`nb-${nb.id}`}
                      onSelect={() => go(`/n/${nb.id}`)}
                      emoji={nb.icon}
                    >
                      {nb.title}
                    </Item>
                  ))}
                </Command.Group>
              )}

              {results.pages.length > 0 && (
                <Command.Group
                  heading="Pages"
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {results.pages.map((p) => (
                    <Item
                      key={p.id}
                      value={`page-${p.id}`}
                      onSelect={() => go(`/n/${p.notebookId}/p/${p.id}`)}
                      icon={FileText}
                      hint={`${p.notebookIcon} ${p.notebookTitle}`}
                    >
                      {p.title}
                    </Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>

      <NewNotebookDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function Item({
  children,
  onSelect,
  icon: Icon,
  emoji,
  hint,
  value,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  icon?: React.ElementType;
  emoji?: string;
  hint?: string;
  value?: string;
}) {
  return (
    <Command.Item
      value={value ?? String(children)}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
        "data-[selected=true]:bg-surface-muted",
      )}
    >
      {emoji ? (
        <span className="text-base leading-none">{emoji}</span>
      ) : Icon ? (
        <Icon className="size-4 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && (
        <span className="shrink-0 truncate text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </Command.Item>
  );
}
