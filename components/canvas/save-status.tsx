"use client";

import * as React from "react";
import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from "lucide-react";

import type { SaveStatus } from "@/lib/canvas/use-autosave";
import { cn, formatRelativeTime } from "@/lib/utils";

/**
 * Save status.
 *
 * Deliberately quiet when things are fine and loud when they are not — the
 * user should be able to trust it without watching it.
 */
export function SaveStatusIndicator({
  status,
  savedAt,
  onRetry,
}: {
  status: SaveStatus;
  savedAt: Date | null;
  onRetry: () => void;
}) {
  // "Saved 10 seconds ago" has to keep counting without a save happening.
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (status !== "saved" || !savedAt) return;
    const timer = setInterval(forceTick, 10_000);
    return () => clearInterval(timer);
  }, [status, savedAt]);

  if (status === "error") {
    return (
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
        title="Your work is saved on this device. Click to retry."
      >
        <CloudOff className="size-3.5" />
        Unable to save
        <RefreshCw className="size-3 animate-spin [animation-duration:2.5s]" />
      </button>
    );
  }

  if (status === "conflict") {
    return (
      <span className="flex items-center gap-1.5 rounded-lg bg-warning/15 px-2.5 py-1.5 text-xs font-medium text-warning">
        <AlertTriangle className="size-3.5" />
        Changed elsewhere
      </span>
    );
  }

  if (status === "saving") {
    return (
      <Pill>
        <Loader2 className="size-3.5 animate-spin" />
        Saving…
      </Pill>
    );
  }

  if (status === "dirty") {
    return (
      <Pill>
        <span className="size-1.5 rounded-full bg-warning" />
        Unsaved
      </Pill>
    );
  }

  if (status === "saved" || savedAt) {
    return (
      <Pill className="text-success">
        <Check className="size-3.5" />
        {savedAt ? `Saved ${formatRelativeTime(savedAt)}` : "Saved"}
      </Pill>
    );
  }

  return null;
}

function Pill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
