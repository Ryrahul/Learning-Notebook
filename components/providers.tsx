"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={350} skipDelayDuration={200}>
        {children}
      </TooltipProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:
              "!rounded-xl !border-border !bg-surface-raised !text-foreground !shadow-float",
            description: "!text-muted-foreground",
            actionButton: "!bg-accent !text-accent-foreground",
            cancelButton: "!bg-muted !text-muted-foreground",
          },
        }}
      />
    </ThemeProvider>
  );
}
