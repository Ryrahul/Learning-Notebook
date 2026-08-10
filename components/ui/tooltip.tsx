"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 overflow-hidden rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lifted",
          "data-[state=delayed-open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/**
 * Convenience wrapper — the vast majority of tooltips in this app are
 * "wrap one control, show one string", optionally with a keyboard hint.
 */
function Tooltip({
  children,
  label,
  keys,
  side = "bottom",
  align = "center",
  delayDuration = 350,
  className,
}: {
  children: React.ReactNode;
  label: React.ReactNode;
  keys?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
  className?: string;
}) {
  return (
    <TooltipRoot delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={className}>
        <span className="flex items-center gap-2">
          {label}
          {keys && (
            <kbd className="rounded border border-background/25 bg-background/15 px-1 font-mono text-[10px] leading-4">
              {keys}
            </kbd>
          )}
        </span>
      </TooltipContent>
    </TooltipRoot>
  );
}

export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
};
