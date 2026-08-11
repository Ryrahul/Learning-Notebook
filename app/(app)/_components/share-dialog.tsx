"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Lock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import {
  disableSharingAction,
  enableSharingAction,
  rotateShareLinkAction,
} from "@/lib/actions/sharing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** The origin never changes for the life of the page, so there is nothing to
 *  subscribe to — this only exists to satisfy the store contract. */
const subscribeToNothing = () => () => {};

export function ShareDialog({
  notebookId,
  notebookTitle,
  initialVisibility,
  initialToken,
  open,
  onOpenChange,
}: {
  notebookId: string;
  notebookTitle: string;
  initialVisibility: "private" | "link";
  initialToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = React.useState(initialVisibility);
  const [token, setToken] = React.useState(initialToken);
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // The origin is only known in the browser, so the link is assembled after
  // hydration. `useSyncExternalStore` gives us a server snapshot of "" and the
  // real value on the client without a setState-in-effect.
  const origin = React.useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );

  const shareUrl = token ? `${origin}/share/${token}` : "";
  const isShared = visibility === "link" && Boolean(token);

  async function toggle(next: boolean) {
    setPending(true);
    const result = next
      ? await enableSharingAction(notebookId)
      : await disableSharingAction(notebookId);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setVisibility(result.visibility);
    setToken(result.shareToken);
    toast.success(
      next ? "Anyone with the link can now view this" : "Sharing turned off",
    );
    router.refresh();
  }

  async function rotate() {
    setPending(true);
    const result = await rotateShareLinkAction(notebookId);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setVisibility(result.visibility);
    setToken(result.shareToken);
    toast.success("New link created — the old one no longer works");
    router.refresh();
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy — select the link and copy it manually.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{notebookTitle}”</DialogTitle>
          <DialogDescription>
            Share a read-only copy of this notebook with anyone, no account
            needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <span
              className={cn(
                "mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg",
                isShared
                  ? "bg-accent-soft text-accent"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {isShared ? (
                <Globe className="size-4" />
              ) : (
                <Lock className="size-4" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {isShared ? "Anyone with the link" : "Only you"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {isShared
                  ? "They can read every page and its canvas. They cannot edit, and the link is never listed or indexed by search engines."
                  : "This notebook is private. Turn on link sharing to let someone read it."}
              </p>
            </div>

            <Switch
              checked={isShared}
              onCheckedChange={toggle}
              disabled={pending}
              aria-label="Share with anyone who has the link"
            />
          </div>

          {isShared && (
            <div className="space-y-3 animate-rise-in">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-surface-muted px-3 py-2">
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="Share link"
                    className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none"
                  />
                </div>
                <Button onClick={copy} variant="accent" className="shrink-0">
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={rotate}
                  loading={pending}
                  className="text-muted-foreground"
                >
                  <RefreshCw />
                  Create a new link
                </Button>

                <Button asChild variant="ghost" size="sm">
                  <a href={shareUrl} target="_blank" rel="noreferrer noopener">
                    <ExternalLink />
                    Preview
                  </a>
                </Button>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Creating a new link immediately breaks the old one. Turning
                sharing off does the same.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
