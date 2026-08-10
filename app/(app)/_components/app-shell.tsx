"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, NotebookPen, Search } from "lucide-react";

import type { CurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { useSyncedFrom } from "@/lib/react-utils";
import { AppSidebar, type SidebarNotebook } from "./app-sidebar";
import { openCommandPalette } from "./command-palette";

/**
 * Responsive shell.
 *
 * Above `lg` the sidebar is a permanent column. Below it, the sidebar becomes
 * an overlay drawer behind a menu button, because a 256px column on a phone
 * leaves nothing for the notebooks themselves.
 */
export function AppShell({
  user,
  notebooks,
  children,
}: {
  user: CurrentUser;
  notebooks: SidebarNotebook[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Navigating should always dismiss the drawer.
  useSyncedFrom(pathname, () => setDrawerOpen(false));

  // Escape closes it, and body scroll is locked while it's open.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh">
      <div className="hidden lg:block">
        <AppSidebar user={user} notebooks={notebooks} />
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px] animate-fade-in"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute inset-y-0 left-0 animate-rise-in">
            <AppSidebar user={user} notebooks={notebooks} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-md lg:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-medium tracking-tight"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
              <NotebookPen className="size-3.5" />
            </span>
            Notebook
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            onClick={openCommandPalette}
            aria-label="Search"
          >
            <Search />
          </Button>
        </header>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
