import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Eye, FileText, NotebookPen } from "lucide-react";

import { getSharedNotebook } from "@/lib/services/sharing";
import { coverTheme } from "@/lib/notebook-theme";
import { cn, formatRelativeTime, pluralize } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

/** Unlisted means unlisted — keep these out of search engines. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedNotebookPage(
  props: PageProps<"/share/[token]">,
) {
  const { token } = await props.params;
  const shared = await getSharedNotebook(token);

  // A revoked, rotated or bogus token is indistinguishable from a notebook
  // that never existed — deliberately, so a 404 leaks nothing.
  if (!shared) notFound();

  const theme = coverTheme(shared.color);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <header className="mb-8 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
            <NotebookPen className="size-3.5" />
          </span>
          Notebook
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline" size="sm">
            <Link href="/signup">Make your own</Link>
          </Button>
        </div>
      </header>

      <div className="mb-8 flex flex-wrap items-start gap-6">
        <div
          className={cn(
            "relative hidden h-36 w-26 shrink-0 flex-col justify-between overflow-hidden rounded-lg p-3 shadow-lifted sm:flex",
            theme.cover,
          )}
        >
          <div className={cn("absolute inset-y-0 left-0 w-2", theme.spine)} />
          <div className="paper-grain absolute inset-0 opacity-40" />
          <span className="relative ml-1 text-2xl leading-none">
            {shared.icon}
          </span>
          <span className="relative ml-1 line-clamp-3 text-[11px] font-medium leading-tight text-white/95">
            {shared.title}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <Badge variant="outline" className="mb-2 gap-1">
            <Eye />
            Shared notebook · read only
          </Badge>
          <h1 className="font-display text-4xl tracking-tight">
            {shared.title}
          </h1>
          {shared.description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {shared.description}
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {pluralize(shared.pages.length, "page")} · updated{" "}
            {formatRelativeTime(shared.updatedAt)}
          </p>
        </div>
      </div>

      {shared.pages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center">
          <FileText className="mx-auto mb-4 size-6 text-muted-foreground" />
          <p className="font-display text-2xl tracking-tight">
            This notebook is empty
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            There are no pages to read yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {shared.pages.map((page) => (
            <Link
              key={page.id}
              href={`/share/${token}/p/${page.id}`}
              className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-paper shadow-paper transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-lifted">
                {page.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={page.thumbnail}
                    alt=""
                    className="size-full object-cover object-top"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="size-full opacity-60"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle, hsl(var(--border-strong)) 1px, transparent 1px)",
                      backgroundSize: "14px 14px",
                    }}
                  />
                )}
                <span
                  className={cn(
                    "absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                    theme.tint,
                    theme.text,
                  )}
                >
                  {page.number}
                </span>
              </div>
              <p className="truncate px-1 pt-2 text-sm font-medium">
                {page.title}
              </p>
            </Link>
          ))}
        </div>
      )}

      <footer className="mt-14 border-t border-border pt-5 text-xs text-muted-foreground">
        You are viewing a shared, read-only notebook. Changes made by its owner
        appear here automatically.
      </footer>
    </div>
  );
}
