"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Copy,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteNotebookAction,
  duplicateNotebookAction,
  updateNotebookAction,
} from "@/lib/actions/notebooks";
import { coverTheme } from "@/lib/notebook-theme";
import { cn, formatRelativeTime, pluralize } from "@/lib/utils";
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
import { EditNotebookDialog } from "./edit-notebook-dialog";

export interface NotebookCardData {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  color: string;
  pageCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  updatedAt: Date;
  lastOpenedAt: Date | null;
}

export function NotebookCard({ notebook }: { notebook: NotebookCardData }) {
  const router = useRouter();
  const theme = coverTheme(notebook.color);

  const [editing, setEditing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Optimistic so the star fills the instant it's clicked, not after a round trip.
  const [favorite, setFavorite] = React.useState(notebook.isFavorite);

  React.useEffect(() => setFavorite(notebook.isFavorite), [notebook.isFavorite]);

  async function toggleFavorite(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
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

  async function toggleArchive() {
    setBusy(true);
    const result = await updateNotebookAction(notebook.id, {
      isArchived: !notebook.isArchived,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not update notebook.");
      return;
    }
    toast.success(notebook.isArchived ? "Notebook restored" : "Notebook archived");
    router.refresh();
  }

  async function duplicate() {
    setBusy(true);
    const result = await duplicateNotebookAction(notebook.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Notebook duplicated");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const result = await deleteNotebookAction(notebook.id);
    setBusy(false);
    setConfirmDelete(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not delete notebook.");
      return;
    }
    toast.success(`“${notebook.title}” deleted`);
    router.refresh();
  }

  return (
    <>
      <div className="group relative">
        <Link
          href={`/n/${notebook.id}`}
          className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          aria-label={`Open ${notebook.title}`}
        >
          {/* Cover — the physical-object cue: spine on the left, slight lift on
              hover, like pulling a book off a shelf. */}
          <div
            className={cn(
              "relative aspect-[3/4] overflow-hidden rounded-xl shadow-paper transition-all duration-200",
              "group-hover:-translate-y-1 group-hover:shadow-lifted",
              theme.cover,
              busy && "opacity-60",
            )}
          >
            <div className={cn("absolute inset-y-0 left-0 w-2.5", theme.spine)} />
            <div className="absolute inset-y-0 left-2.5 w-px bg-white/20" />
            <div className="paper-grain absolute inset-0 opacity-40" />

            <div className="relative flex h-full flex-col justify-between p-4 pl-6">
              <span className="text-3xl leading-none drop-shadow-sm">
                {notebook.icon}
              </span>
              <div>
                <p className="line-clamp-3 font-medium leading-snug text-white drop-shadow-sm">
                  {notebook.title}
                </p>
                <p className="mt-1 text-xs text-white/75">
                  {pluralize(notebook.pageCount, "page")}
                </p>
              </div>
            </div>
          </div>

          <div className="px-1 pt-2.5">
            <p className="truncate text-sm font-medium">{notebook.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {notebook.pageCount === 0
                ? "Empty — open to add a page"
                : `Edited ${formatRelativeTime(notebook.updatedAt)}`}
            </p>
          </div>
        </Link>

        {/* Controls sit above the link so they don't navigate. */}
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 data-[open=true]:opacity-100">
          <button
            onClick={toggleFavorite}
            aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
            className="grid size-7 place-items-center rounded-lg bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/40"
          >
            <Star
              className={cn("size-3.5", favorite && "fill-amber-300 text-amber-300")}
            />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Options for ${notebook.title}`}
                className="grid size-7 place-items-center rounded-lg bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/40"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil />
                Rename & customise
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={duplicate}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={toggleArchive}>
                {notebook.isArchived ? <ArchiveRestore /> : <Archive />}
                {notebook.isArchived ? "Restore" : "Archive"}
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

        {favorite && (
          <Star
            className="pointer-events-none absolute left-3.5 top-2.5 size-3.5 fill-amber-300 text-amber-300 drop-shadow group-hover:opacity-0"
            aria-hidden
          />
        )}
      </div>

      <EditNotebookDialog
        notebook={notebook}
        open={editing}
        onOpenChange={setEditing}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete “{notebook.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the notebook and all{" "}
            {pluralize(notebook.pageCount, "page")} inside it, including their
            canvases. This cannot be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>
              Delete notebook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Placeholder tile that opens the create dialog — reads as an empty shelf slot. */
export function NewNotebookTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:bg-accent-soft/40 hover:text-accent"
    >
      <span className="grid size-10 place-items-center rounded-full border border-current/30 transition-transform group-hover:scale-110">
        +
      </span>
      <span className="text-sm font-medium">New notebook</span>
    </button>
  );
}
