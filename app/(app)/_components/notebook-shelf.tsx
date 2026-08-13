"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  Archive,
  Check,
  Clock,
  Flame,
  LayoutGrid,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";

import { cn, formatDuration, pluralize } from "@/lib/utils";
import { coverTheme } from "@/lib/notebook-theme";
import { useMounted } from "@/lib/react-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/primitives";
import { RelativeTime } from "@/components/relative-time";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NewNotebookTile,
  NotebookCard,
  type NotebookCardData,
} from "./notebook-card";
import { NewNotebookDialog } from "./new-notebook-dialog";

interface RecentPage {
  id: string;
  title: string;
  notebookId: string;
  notebookTitle: string;
  notebookIcon: string;
  notebookColor: string;
  thumbnail: string | null;
  lastEditedAt: Date;
}

const SORT_LABELS: Record<string, string> = {
  recent: "Recently used",
  alphabetical: "Alphabetical",
  created: "Date created",
  manual: "Custom order",
};

const FILTERS = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "favorites", label: "Favourites", icon: Star },
  { value: "archived", label: "Archived", icon: Archive },
] as const;

export function NotebookShelf({
  userName,
  notebooks,
  recentPages,
  stats,
  sort,
  filter,
  query,
}: {
  userName: string;
  notebooks: NotebookCardData[];
  recentPages: RecentPage[];
  stats: {
    currentStreak: number;
    secondsThisWeek: number;
    pagesCreatedThisWeek: number;
  };
  sort: string;
  filter: string;
  query: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState(query);

  // Filters live in the URL so the view is shareable and survives a refresh.
  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Debounced so typing doesn't fire a navigation per keystroke.
  React.useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => setParam("q", search.trim() || null), 250);
    return () => clearTimeout(timer);
  }, [search, query, setParam]);

  // The greeting depends on the *viewer's* local hour, which the server cannot
  // know: it renders in UTC while the reader may be hours away, so SSR and
  // hydration disagree (React #418). useSyncExternalStore renders the neutral
  // server snapshot during hydration and swaps to the local greeting after.
  const mounted = useMounted();
  const greeting = mounted ? getGreeting() : "Welcome back";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {greeting}, {userName.split(" ")[0]}
            </p>
            <h1 className="mt-1 font-display text-4xl tracking-tight">
              Your study space
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {stats.currentStreak > 0 && (
              <Badge variant="warning" className="h-8 gap-1.5 px-3 text-xs">
                <Flame className="size-3.5" />
                {pluralize(stats.currentStreak, "day")} streak
              </Badge>
            )}
            {stats.secondsThisWeek > 0 && (
              <Badge variant="outline" className="h-8 gap-1.5 px-3 text-xs">
                <Clock className="size-3.5" />
                {formatDuration(stats.secondsThisWeek)} this week
              </Badge>
            )}
            <Button variant="accent" onClick={() => setCreating(true)}>
              <Plus />
              New notebook
            </Button>
          </div>
        </div>
      </header>

      {recentPages.length > 0 && filter === "all" && !query && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Pick up where you left off
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {recentPages.map((page) => (
              <RecentPageCard key={page.id} page={page} />
            ))}
          </div>
        </section>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter notebooks…"
            className="pl-9 pr-9"
            aria-label="Filter notebooks"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {FILTERS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setParam("filter", value === "all" ? null : value)}
              aria-pressed={filter === value}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                filter === value
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ArrowUpDown />
              {SORT_LABELS[sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <DropdownMenuItem
                key={value}
                onSelect={() =>
                  setParam("sort", value === "recent" ? null : value)
                }
              >
                {sort === value ? (
                  <Check className="!text-accent" />
                ) : (
                  <span className="size-4" />
                )}
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-auto text-sm text-muted-foreground">
          {pluralize(notebooks.length, "notebook")}
        </span>
      </div>

      {notebooks.length === 0 ? (
        <EmptyState
          filter={filter}
          query={query}
          onCreate={() => setCreating(true)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {notebooks.map((notebook) => (
            <NotebookCard key={notebook.id} notebook={notebook} />
          ))}
          {filter === "all" && !query && (
            <NewNotebookTile onClick={() => setCreating(true)} />
          )}
        </div>
      )}

      <NewNotebookDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function RecentPageCard({ page }: { page: RecentPage }) {
  const theme = coverTheme(page.notebookColor);

  return (
    <Link
      href={`/n/${page.notebookId}/p/${page.id}`}
      className="group w-52 shrink-0 rounded-xl border border-border bg-surface p-2 shadow-paper transition-all hover:-translate-y-0.5 hover:shadow-lifted"
    >
      <div
        className={cn(
          "mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border",
          theme.tint,
        )}
      >
        {page.thumbnail ? (
          // Canvas previews are generated PNG data URLs, so next/image would
          // add machinery without adding value here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.thumbnail}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-xs text-muted-foreground">Empty page</span>
        )}
      </div>
      <p className="truncate px-1 text-sm font-medium">{page.title}</p>
      <p className="mt-0.5 truncate px-1 text-xs text-muted-foreground">
        {page.notebookIcon} {page.notebookTitle} ·{" "}
        <RelativeTime date={page.lastEditedAt} />
      </p>
    </Link>
  );
}

function EmptyState({
  filter,
  query,
  onCreate,
}: {
  filter: string;
  query: string;
  onCreate: () => void;
}) {
  if (query) {
    return (
      <Empty
        title={`No notebooks match “${query}”`}
        body="Try a different word, or search inside your pages instead."
        action={
          <Button asChild variant="outline">
            <Link href={`/search?q=${encodeURIComponent(query)}`}>
              Search page contents
            </Link>
          </Button>
        }
      />
    );
  }

  if (filter === "favorites") {
    return (
      <Empty
        title="No favourites yet"
        body="Star a notebook and it will show up here and at the top of your sidebar."
      />
    );
  }

  if (filter === "archived") {
    return (
      <Empty
        title="Nothing archived"
        body="Archiving keeps a notebook out of the way without deleting it."
      />
    );
  }

  return (
    <Empty
      title="Your shelf is empty"
      body="Create your first notebook — one per subject works well. Each one holds as many pages as you need."
      action={
        <Button variant="accent" onClick={onCreate}>
          <Plus />
          Create your first notebook
        </Button>
      }
    />
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
      <div className="mb-5 flex gap-2" aria-hidden>
        {["📘", "📗", "📙"].map((icon, i) => (
          <span
            key={icon}
            className="grid h-20 w-14 place-items-end rounded-lg border border-border bg-surface p-2 text-xl shadow-paper"
            style={{ transform: `rotate(${(i - 1) * 5}deg)` }}
          >
            {icon}
          </span>
        ))}
      </div>
      <h3 className="font-display text-2xl tracking-tight">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
