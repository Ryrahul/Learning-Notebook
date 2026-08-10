"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Copy,
  FileText,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  createPageAction,
  deletePageAction,
  duplicatePageAction,
  renamePageAction,
  reorderPageAction,
} from "@/lib/actions/pages";
import { updateNotebookAction } from "@/lib/actions/notebooks";
import { coverTheme } from "@/lib/notebook-theme";
import { cn, formatRelativeTime, pluralize } from "@/lib/utils";
import type { ActivityType } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Separator } from "@/components/ui/primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { EditNotebookDialog } from "./edit-notebook-dialog";

interface PageItem {
  id: string;
  notebookId: string;
  title: string;
  sortIndex: string;
  paperStyle: string;
  thumbnail: string | null;
  lastEditedAt: Date;
  createdAt: Date;
}

interface TimelineItem {
  id: string;
  type: ActivityType;
  occurredAt: Date;
  pageTitle: string | null;
  pageId: string | null;
}

interface NotebookMeta {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  color: string;
  isFavorite: boolean;
  isArchived: boolean;
  updatedAt: Date;
  createdAt: Date;
  pageCount: number;
}

export function NotebookView({
  notebook,
  pages,
  timeline,
}: {
  notebook: NotebookMeta;
  pages: PageItem[];
  timeline: TimelineItem[];
}) {
  const router = useRouter();
  const theme = coverTheme(notebook.color);

  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [favorite, setFavorite] = React.useState(notebook.isFavorite);

  // Local copy so drag-reorder repaints immediately; the server call follows.
  const [order, setOrder] = React.useState(pages);
  React.useEffect(() => setOrder(pages), [pages]);

  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return order;
    return order.filter((page) => page.title.toLowerCase().includes(term));
  }, [order, query]);

  async function addPage() {
    setCreating(true);
    const result = await createPageAction(notebook.id);
    setCreating(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`/n/${notebook.id}/p/${result.id}`);
  }

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    const result = await updateNotebookAction(notebook.id, { isFavorite: next });
    if (!result.ok) {
      setFavorite(!next);
      toast.error(result.error ?? "Could not update notebook.");
      return;
    }
    router.refresh();
  }

  async function commitReorder(pageId: string, targetIndex: number) {
    const current = order.findIndex((p) => p.id === pageId);
    if (current === -1) return;

    // Optimistic move.
    const next = [...order];
    const [moved] = next.splice(current, 1);
    const insertAt = current < targetIndex ? targetIndex - 1 : targetIndex;
    next.splice(insertAt, 0, moved);
    setOrder(next);

    const result = await reorderPageAction(pageId, notebook.id, targetIndex);
    if (!result.ok) {
      setOrder(pages);
      toast.error(result.error ?? "Could not reorder pages.");
      return;
    }
    router.refresh();
  }

  const reorderable = query.trim().length === 0;

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All notebooks
      </Link>

      <header className="mb-8 flex flex-wrap items-start gap-6">
        <div
          className={cn(
            "relative hidden h-32 w-24 shrink-0 flex-col justify-between overflow-hidden rounded-lg p-3 shadow-lifted sm:flex",
            theme.cover,
          )}
        >
          <div className={cn("absolute inset-y-0 left-0 w-2", theme.spine)} />
          <div className="paper-grain absolute inset-0 opacity-40" />
          <span className="relative ml-1 text-xl leading-none">
            {notebook.icon}
          </span>
          <span className="relative ml-1 line-clamp-3 text-[11px] font-medium leading-tight text-white/95">
            {notebook.title}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-4xl tracking-tight">
              {notebook.title}
            </h1>
            {notebook.isArchived && <Badge variant="outline">Archived</Badge>}
          </div>

          {notebook.description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {notebook.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{pluralize(order.length, "page")}</span>
            <span aria-hidden>·</span>
            <span>Edited {formatRelativeTime(notebook.updatedAt)}</span>
            <span aria-hidden>·</span>
            <span>Created {formatRelativeTime(notebook.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip label={favorite ? "Remove from favourites" : "Add to favourites"}>
            <Button variant="outline" size="icon" onClick={toggleFavorite}>
              <Star
                className={cn(favorite && "fill-amber-400 text-amber-400")}
              />
            </Button>
          </Tooltip>
          <Tooltip label="Notebook settings">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setEditing(true)}
            >
              <Settings2 />
            </Button>
          </Tooltip>
          <Button variant="accent" onClick={addPage} loading={creating}>
            <Plus />
            New page
          </Button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a page…"
                className="pl-9 pr-9"
                aria-label="Find a page"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear"
                  className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {reorderable && order.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Drag a page to reorder
              </p>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {pluralize(filtered.length, "page")}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyPages
              hasQuery={query.trim().length > 0}
              query={query}
              onCreate={addPage}
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((page, index) => (
                <PageCard
                  key={page.id}
                  page={page}
                  index={index}
                  notebookColor={notebook.color}
                  draggable={reorderable}
                  isDragging={dragId === page.id}
                  showDropBefore={dropIndex === index}
                  onDragStart={() => setDragId(page.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropIndex(null);
                  }}
                  onDragOverIndex={setDropIndex}
                  onDrop={(target) => {
                    if (dragId) void commitReorder(dragId, target);
                    setDragId(null);
                    setDropIndex(null);
                  }}
                />
              ))}
              {reorderable && (
                <button
                  onClick={addPage}
                  className="group flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:bg-accent-soft/40 hover:text-accent"
                >
                  <span className="grid size-9 place-items-center rounded-full border border-current/30 transition-transform group-hover:scale-110">
                    <Plus className="size-4" />
                  </span>
                  <span className="text-sm font-medium">New page</span>
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Clock className="size-3.5 text-muted-foreground" />
            Recent activity
          </h2>
          <Separator className="mb-3" />
          {timeline.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Nothing yet. Activity from this notebook shows up here.
            </p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((entry) => (
                <li key={entry.id} className="flex gap-2.5 text-xs">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      theme.dot,
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-foreground/90">
                      {describeActivity(entry)}
                    </p>
                    <p className="text-muted-foreground">
                      {formatRelativeTime(entry.occurredAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      <EditNotebookDialog
        notebook={notebook}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  );
}

function PageCard({
  page,
  index,
  notebookColor,
  draggable,
  isDragging,
  showDropBefore,
  onDragStart,
  onDragEnd,
  onDragOverIndex,
  onDrop,
}: {
  page: PageItem;
  index: number;
  notebookColor: string;
  draggable: boolean;
  isDragging: boolean;
  showDropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverIndex: (index: number | null) => void;
  onDrop: (targetIndex: number) => void;
}) {
  const router = useRouter();
  const theme = coverTheme(notebookColor);

  const [renaming, setRenaming] = React.useState(false);
  const [title, setTitle] = React.useState(page.title);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => setTitle(page.title), [page.title]);

  async function commitRename() {
    setRenaming(false);
    const trimmed = title.trim();
    if (!trimmed || trimmed === page.title) {
      setTitle(page.title);
      return;
    }

    const result = await renamePageAction(page.id, trimmed);
    if (!result.ok) {
      setTitle(page.title);
      toast.error(result.error ?? "Could not rename page.");
      return;
    }
    router.refresh();
  }

  async function duplicate() {
    const result = await duplicatePageAction(page.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Page duplicated");
    router.refresh();
  }

  async function remove() {
    setConfirmDelete(false);
    const result = await deletePageAction(page.id, page.notebookId);
    if (!result.ok) {
      toast.error(result.error ?? "Could not delete page.");
      return;
    }
    toast.success(`“${page.title}” deleted`);
    router.refresh();
  }

  return (
    <>
      <div
        className={cn("group relative", isDragging && "opacity-40")}
        draggable={draggable}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          // Firefox requires data to be set for a drag to start at all.
          event.dataTransfer.setData("text/plain", page.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (!draggable) return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          const after = event.clientX > box.left + box.width / 2;
          onDragOverIndex(after ? index + 1 : index);
        }}
        onDragLeave={() => onDragOverIndex(null)}
        onDrop={(event) => {
          if (!draggable) return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          const after = event.clientX > box.left + box.width / 2;
          onDrop(after ? index + 1 : index);
        }}
      >
        {showDropBefore && (
          <span className="absolute -left-2 top-0 h-full w-0.5 rounded-full bg-accent" />
        )}

        <Link
          href={`/n/${page.notebookId}/p/${page.id}`}
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          {/* Sheet of paper: white, subtle lift, page number bottom-right. */}
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
              {index + 1}
            </span>
          </div>
        </Link>

        <div className="flex items-start gap-1 px-1 pt-2">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") {
                    setTitle(page.title);
                    setRenaming(false);
                  }
                }}
                autoFocus
                className="h-7 px-1.5 py-0 text-sm"
                aria-label="Page title"
              />
            ) : (
              <button
                onDoubleClick={() => setRenaming(true)}
                className="block w-full truncate text-left text-sm font-medium"
                title={`${page.title} — double-click to rename`}
              >
                {page.title}
              </button>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {formatRelativeTime(page.lastEditedAt)}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Options for ${page.title}`}
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-surface-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={duplicate}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {draggable && (
          <span className="absolute left-2 top-2 grid size-6 place-items-center rounded-md bg-black/20 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            <GripVertical className="size-3.5" />
          </span>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete “{page.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The page and everything drawn on it will be removed from this
            notebook.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete page</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmptyPages({
  hasQuery,
  query,
  onCreate,
}: {
  hasQuery: boolean;
  query: string;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-xl border border-border bg-paper shadow-paper">
        <FileText className="size-5 text-muted-foreground" />
      </span>
      <h3 className="font-display text-2xl tracking-tight">
        {hasQuery ? `No page matches “${query}”` : "No pages yet"}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {hasQuery
          ? "Try a different word — page titles are matched here."
          : "Add your first page and start writing, drawing or diagramming on it."}
      </p>
      {!hasQuery && (
        <Button variant="accent" className="mt-6" onClick={onCreate}>
          <Plus />
          Create the first page
        </Button>
      )}
    </div>
  );
}

const ACTIVITY_VERBS: Partial<Record<ActivityType, string>> = {
  "page.created": "Created",
  "page.edited": "Edited",
  "page.renamed": "Renamed",
  "page.deleted": "Deleted",
  "page.duplicated": "Duplicated",
  "notebook.created": "Created this notebook",
  "notebook.renamed": "Renamed this notebook",
  "image.added": "Added an image to",
};

function describeActivity(entry: TimelineItem) {
  const verb = ACTIVITY_VERBS[entry.type] ?? "Updated";
  if (!entry.pageTitle) return verb;
  return `${verb} ${entry.pageTitle}`;
}
