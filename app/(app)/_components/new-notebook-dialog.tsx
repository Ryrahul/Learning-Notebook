"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createNotebookAction } from "@/lib/actions/notebooks";
import { COVER_THEMES, NOTEBOOK_ICONS, coverTheme } from "@/lib/notebook-theme";
import type { NotebookColor } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function NewNotebookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [icon, setIcon] = React.useState("📓");
  const [color, setColor] = React.useState<NotebookColor>("indigo");
  const [pending, setPending] = React.useState(false);

  // Reset when reopened so a cancelled draft doesn't linger.
  React.useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setIcon("📓");
      setColor("indigo");
    }
  }, [open]);

  const theme = coverTheme(color);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Give your notebook a name.");
      return;
    }

    setPending(true);
    const result = await createNotebookAction({
      title,
      description: description || null,
      icon,
      color,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`“${title.trim()}” created`);
    onOpenChange(false);
    onCreated?.(result.id);
    router.push(`/n/${result.id}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New notebook</DialogTitle>
          <DialogDescription>
            Give it a name and a cover. You can change both later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="flex gap-5">
            {/* Live cover preview — the point of picking a colour is seeing it. */}
            <div
              className={cn(
                "relative flex h-40 w-28 shrink-0 flex-col justify-between overflow-hidden rounded-lg p-3 shadow-lifted",
                theme.cover,
              )}
            >
              <div
                className={cn("absolute inset-y-0 left-0 w-2", theme.spine)}
              />
              <span className="ml-1 text-2xl leading-none">{icon}</span>
              <span className="ml-1 line-clamp-3 text-xs font-medium leading-tight text-white/95">
                {title.trim() || "Untitled notebook"}
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nb-title">Name</Label>
                <Input
                  id="nb-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="System Design"
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nb-description">Description</Label>
                <Textarea
                  id="nb-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — what this notebook is for."
                  maxLength={500}
                  className="min-h-[4.5rem]"
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
              {(
                Object.entries(COVER_THEMES) as [NotebookColor, typeof theme][]
              ).map(([value, option]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  aria-pressed={color === value}
                  aria-label={option.label}
                  title={option.label}
                  className={cn(
                    "size-7 rounded-full transition-transform hover:scale-110",
                    option.cover,
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
              Create notebook
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
