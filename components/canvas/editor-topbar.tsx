"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  createPageAction,
  deletePageAction,
  duplicatePageAction,
  renamePageAction,
} from "@/lib/actions/pages";
import { Button } from "@/components/ui/button";
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
import { ThemeToggle } from "@/components/theme-toggle";
import { useSyncedFrom } from "@/lib/react-utils";

export interface EditorTopbarProps {
  page: { id: string; title: string; notebookId: string };
  notebook: { id: string; title: string; icon: string };
  position: {
    index: number;
    total: number;
    previousPageId: string | null;
    nextPageId: string | null;
  };
  saveStatus: React.ReactNode;
  onToggleNavigator: () => void;
  navigatorOpen: boolean;
  /** Flush pending work before we navigate away from the page. */
  onBeforeLeave: () => Promise<void>;
}

export function EditorTopbar({
  page,
  notebook,
  position,
  saveStatus,
  onToggleNavigator,
  navigatorOpen,
  onBeforeLeave,
}: EditorTopbarProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(page.title);
  const [renaming, setRenaming] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  useSyncedFrom(page.id, () => setTitle(page.title));

  /** Every exit from this page flushes first — no route change loses ink. */
  const leaveTo = React.useCallback(
    async (href: string) => {
      await onBeforeLeave();
      router.push(href);
    },
    [onBeforeLeave, router],
  );

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

  async function addPage() {
    setBusy(true);
    await onBeforeLeave();
    const result = await createPageAction(page.notebookId, {
      afterPageId: page.id,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`/n/${page.notebookId}/p/${result.id}`);
  }

  async function duplicate() {
    setBusy(true);
    await onBeforeLeave();
    const result = await duplicatePageAction(page.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Page duplicated");
    router.push(`/n/${page.notebookId}/p/${result.id}`);
  }

  async function remove() {
    setConfirmDelete(false);
    const result = await deletePageAction(page.id, page.notebookId);
    if (!result.ok) {
      toast.error(result.error ?? "Could not delete page.");
      return;
    }
    toast.success("Page deleted");
    const fallback =
      position.previousPageId ?? position.nextPageId ?? null;
    router.push(
      fallback
        ? `/n/${page.notebookId}/p/${fallback}`
        : `/n/${page.notebookId}`,
    );
  }

  return (
    <>
      <header className="flex h-13 shrink-0 items-center gap-3 border-b border-border bg-surface/85 px-3 backdrop-blur-md">
        <Tooltip label="Back to notebook">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to notebook"
            onClick={() => leaveTo(`/n/${notebook.id}`)}
          >
            <ArrowLeft />
          </Button>
        </Tooltip>

        <Tooltip label={navigatorOpen ? "Hide pages" : "Show pages"} keys="⌘\\">
          <Button
            variant={navigatorOpen ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Toggle page navigator"
            aria-pressed={navigatorOpen}
            onClick={onToggleNavigator}
          >
            <Layers />
          </Button>
        </Tooltip>

        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-base leading-none">{notebook.icon}</span>
          <Link
            href={`/n/${notebook.id}`}
            onClick={(event) => {
              event.preventDefault();
              void leaveTo(`/n/${notebook.id}`);
            }}
            className="shrink-0 truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {notebook.title}
          </Link>
          <span className="shrink-0 text-muted-foreground/50" aria-hidden>
            /
          </span>

          {renaming ? (
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setTitle(page.title);
                  setRenaming(false);
                }
              }}
              autoFocus
              aria-label="Page title"
              className="min-w-0 max-w-xs flex-1 rounded-md border border-input bg-surface px-2 py-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />
          ) : (
            <button
              onClick={() => setRenaming(true)}
              className="min-w-0 truncate rounded-md px-1.5 py-1 text-sm font-medium transition-colors hover:bg-surface-muted"
              title="Click to rename"
            >
              {title}
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {saveStatus}

          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
            <Tooltip label="Previous page" keys="⌥←">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous page"
                disabled={!position.previousPageId}
                onClick={() =>
                  position.previousPageId &&
                  leaveTo(`/n/${notebook.id}/p/${position.previousPageId}`)
                }
              >
                <ChevronLeft />
              </Button>
            </Tooltip>
            <span className="px-1.5 text-xs tabular-nums text-muted-foreground">
              {position.index + 1} / {position.total}
            </span>
            <Tooltip label="Next page" keys="⌥→">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next page"
                disabled={!position.nextPageId}
                onClick={() =>
                  position.nextPageId &&
                  leaveTo(`/n/${notebook.id}/p/${position.nextPageId}`)
                }
              >
                <ChevronRight />
              </Button>
            </Tooltip>
          </div>

          <Tooltip label="New page">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="New page"
              loading={busy}
              onClick={addPage}
            >
              <Plus />
            </Button>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Page options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                Rename page
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={duplicate}>
                <Copy />
                Duplicate page
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Delete page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle />
        </div>
      </header>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete “{page.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Everything drawn on this page will be removed from the notebook.
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
