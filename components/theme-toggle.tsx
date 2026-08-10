"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

const ORDER = ["light", "dark", "system"] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Theme is unknown until hydration; render a stable placeholder so the
  // server and client markup agree.
  React.useEffect(() => setMounted(true), []);

  const current = (theme ?? "system") as (typeof ORDER)[number];
  const Icon = !mounted
    ? Monitor
    : current === "dark"
      ? Moon
      : current === "light"
        ? Sun
        : Monitor;

  return (
    <Tooltip label={`Theme: ${mounted ? current : "system"}`}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={className}
        aria-label="Toggle theme"
        onClick={() => {
          const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
          setTheme(next);
        }}
      >
        <Icon />
      </Button>
    </Tooltip>
  );
}
