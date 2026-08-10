"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateNotebookAction } from "@/lib/actions/notebooks";
import { COVER_THEMES, NOTEBOOK_ICONS, coverTheme } from "@/lib/notebook-theme";
import type { NotebookColor } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { useSyncedFrom } from "@/lib/react-utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EditNotebookDialog({
  notebook,
  open,
  onOpenChange,
}: {
  notebook: {
    id: string;
    title: string;
    description: string | null;
    icon: string;
    color: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState(notebook.title);
  const [description, setDescription] = React.useState(
    notebook.description ?? "",
  );
  const [icon, setIcon] = React.useState(notebook.icon);
  const [color, setColor] = React.useState(notebook.color as NotebookColor);
  const [pending, setPending] = React.useState(false);

  // Re-seed from props each time it opens, so a cancelled edit is discarded.
  useSyncedFrom(open, (isOpen) => {
    if (!isOpen) return;
    setTitle(notebook.title);
    setDescription(notebook.description ?? "");
    setIcon(notebook.icon);
    setColor(notebook.color as NotebookColor);
  });

  const theme = coverTheme(color);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await updateNotebookAction(notebook.id, {
      title,
      description: description || null,
      icon,
      color,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error ?? "Could not save changes.");
      return;
    }

    toast.success("Notebook updated");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Notebook settings</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="flex gap-5">
            <div
              className={cn(
                "relative flex h-36 w-24 shrink-0 flex-col justify-between overflow-hidden rounded-lg p-3 shadow-lifted",
                theme.cover,
              )}
            >
              <div className={cn("absolute inset-y-0 left-0 w-2", theme.spine)} />
              <span className="ml-1 text-xl leading-none">{icon}</span>
              <span className="ml-1 line-clamp-3 text-[11px] font-medium leading-tight text-white/95">
                {title.trim() || "Untitled notebook"}
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-title">Name</Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  className="min-h-[4rem]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1">
              {NOTEBOOK_ICONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setIcon(option)}
                  aria-pressed={icon === option}
                  aria-label={`Icon ${option}`}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg text-base transition-colors",
                    icon === option
                      ? "bg-accent-soft ring-2 ring-accent"
                      : "hover:bg-surface-muted",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cover</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(COVER_THEMES) as NotebookColor[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  aria-pressed={color === value}
                  aria-label={COVER_THEMES[value].label}
                  title={COVER_THEMES[value].label}
                  className={cn(
                    "size-7 rounded-full transition-transform hover:scale-110",
                    COVER_THEMES[value].cover,
                    color === value &&
                      "ring-2 ring-foreground ring-offset-2 ring-offset-surface-raised",
                  )}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="accent" loading={pending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
