"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Search, X } from "lucide-react";

import { coverTheme } from "@/lib/notebook-theme";
import { cn, pluralize } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useSyncedFrom } from "@/lib/react-utils";
import { RelativeTime } from "@/components/relative-time";

interface NotebookHit {
  id: string;
  title: string;
  icon: string;
  color: string;
  pageCount: number;
}

interface PageHit {
  id: string;
  title: string;
  notebookId: string;
  notebookTitle: string;
  notebookIcon: string;
  excerpt: string | null;
  lastEditedAt: Date;
}

export function SearchView({
  query,
  notebooks,
  pages,
}: {
  query: string;
  notebooks: NotebookHit[];
  pages: PageHit[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = React.useState(query);

  useSyncedFrom(query, setValue);

  // Debounced so each keystroke doesn't run a full-text query.
  React.useEffect(() => {
    if (value === query) return;
    const timer = setTimeout(() => {
      const trimmed = value.trim();
      router.replace(
        trimmed ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname,
        { scroll: false },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [value, query, pathname, router]);

  // Group page hits under their notebook, which is how the brief frames it and
  // how people actually think about where a note lives.
  const grouped = React.useMemo(() => {
    const map = new Map<string, { notebook: PageHit; pages: PageHit[] }>();
    for (const page of pages) {
      const existing = map.get(page.notebookId);
      if (existing) existing.pages.push(page);
      else map.set(page.notebookId, { notebook: page, pages: [page] });
    }
    return [...map.values()];
  }, [pages]);

  const total = notebooks.length + pages.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-6 font-display text-4xl tracking-tight">Search</h1>

      <div className="relative mb-8">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search notebooks and everything written on your pages…"
          className="h-12 pl-10 pr-10 text-base"
          aria-label="Search"
          autoFocus
        />
        {value && (
          <button
            onClick={() => setValue("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!query.trim() ? (
        <Prompt />
      ) : total === 0 ? (
        <Empty query={query} />
      ) : (
        <>
          <p className="mb-5 text-sm text-muted-foreground">
            {pluralize(total, "result")} for “{query}”
          </p>

          {notebooks.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Notebooks
              </h2>
              <div className="space-y-1">
                {notebooks.map((notebook) => {
                  const theme = coverTheme(notebook.color);
                  return (
                    <Link
                      key={notebook.id}
                      href={`/n/${notebook.id}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-paper transition-colors hover:border-border-strong"
                    >
                      <span
                        className={cn(
                          "grid size-9 place-items-center rounded-lg text-lg",
                          theme.tint,
                        )}
                      >
                        {notebook.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {notebook.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {pluralize(notebook.pageCount, "page")}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {grouped.map(({ notebook, pages: hits }) => (
            <section key={notebook.notebookId} className="mb-7">
              <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span className="text-sm">{notebook.notebookIcon}</span>
                {notebook.notebookTitle}
              </h2>
              <div className="space-y-1">
                {hits.map((page) => (
                  <Link
                    key={page.id}
                    href={`/n/${page.notebookId}/p/${page.id}`}
                    className="flex gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-paper transition-colors hover:border-border-strong"
                  >
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-medium">
                          {page.title}
                        </span>
                        <RelativeTime
                          date={page.lastEditedAt}
                          className="shrink-0 text-xs text-muted-foreground"
                        />
                      </span>
                      {page.excerpt && (
                        // ts_headline returns <mark> around matches; the string
                        // is built by Postgres from our own stored text, and
                        // the format only ever emits <mark>/</mark>.
                        <span
                          className="mt-1 block text-sm leading-relaxed text-muted-foreground [&_mark]:rounded [&_mark]:bg-warning/25 [&_mark]:px-0.5 [&_mark]:text-foreground"
                          dangerouslySetInnerHTML={{ __html: page.excerpt }}
                        />
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function Prompt() {
  return (
    <div className="rounded-2xl border border-dashed border-border py-16 text-center">
      <p className="font-display text-2xl tracking-tight">
        Search across everything
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Notebook names, page titles, and every piece of text written on any
        canvas. Try a topic you have been studying.
      </p>
    </div>
  );
}

function Empty({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border py-16 text-center">
      <p className="font-display text-2xl tracking-tight">
        Nothing matches “{query}”
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Only typed text is indexed — handwritten strokes are not searchable yet.
      </p>
    </div>
  );
}
