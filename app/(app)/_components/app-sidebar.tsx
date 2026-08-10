"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  LayoutGrid,
  LogOut,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { coverTheme } from "@/lib/notebook-theme";
import type { CurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Kbd, ScrollArea, Separator } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewNotebookDialog } from "./new-notebook-dialog";
import { openCommandPalette } from "./command-palette";

export interface SidebarNotebook {
  id: string;
  title: string;
  icon: string;
  color: string;
  pageCount: number;
  isFavorite: boolean;
}

const NAV = [
  { href: "/dashboard", label: "All notebooks", icon: LayoutGrid },
  { href: "/activity", label: "Progress", icon: TrendingUp },
  { href: "/search", label: "Search", icon: Search },
];

export function AppSidebar({
  user,
  notebooks,
}: {
  user: CurrentUser;
  notebooks: SidebarNotebook[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const favorites = notebooks.filter((n) => n.isFavorite);
  const recent = notebooks.slice(0, 12);

  async function handleSignOut() {
    await authClient.signOut();
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-border bg-surface-muted/60 transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-4">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 font-medium tracking-tight"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
            <NotebookPen className="size-4" />
          </span>
          {!collapsed && <span className="truncate">Notebook</span>}
        </Link>
        {!collapsed && (
          <Tooltip label="Collapse sidebar">
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
            >
              <ChevronLeft />
            </Button>
          </Tooltip>
        )}
      </div>

      {collapsed && (
        <div className="px-3 pb-2">
          <Tooltip label="Expand sidebar" side="right">
            <Button
              variant="ghost"
              size="icon-sm"
              className="w-full"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <ChevronLeft className="rotate-180" />
            </Button>
          </Tooltip>
        </div>
      )}

      <div className="space-y-1 px-3">
        <Button
          variant="accent"
          className={cn("w-full", collapsed && "px-0")}
          onClick={() => setCreating(true)}
        >
          <Plus />
          {!collapsed && "New notebook"}
        </Button>

        <button
          onClick={openCommandPalette}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <Search className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span>Search…</span>
              <Kbd className="ml-auto">⌘K</Kbd>
            </>
          )}
        </button>
      </div>

      <nav className="mt-4 space-y-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <NavLink
              key={href}
              href={href}
              icon={Icon}
              label={label}
              active={active}
              collapsed={collapsed}
            />
          );
        })}
      </nav>

      <Separator className="my-4" />

      <ScrollArea className="min-h-0 flex-1 px-3">
        {favorites.length > 0 && (
          <Section title="Favourites" collapsed={collapsed}>
            {favorites.map((nb) => (
              <NotebookLink
                key={nb.id}
                notebook={nb}
                collapsed={collapsed}
                active={pathname.startsWith(`/n/${nb.id}`)}
              />
            ))}
          </Section>
        )}

        <Section title="Recent" collapsed={collapsed}>
          {recent.length === 0 ? (
            !collapsed && (
              <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
                No notebooks yet. Create one to get started.
              </p>
            )
          ) : (
            recent.map((nb) => (
              <NotebookLink
                key={nb.id}
                notebook={nb}
                collapsed={collapsed}
                active={pathname.startsWith(`/n/${nb.id}`)}
              />
            ))
          )}
        </Section>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface",
                collapsed && "justify-center px-0",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
                {user.name.charAt(0).toUpperCase()}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/activity">
                <Sparkles />
                Study progress
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={handleSignOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {!collapsed && (
          <div className="mt-1 flex justify-end">
            <ThemeToggle />
          </div>
        )}
      </div>

      <NewNotebookDialog open={creating} onOpenChange={setCreating} />
    </aside>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-surface font-medium text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && label}
    </Link>
  );

  return collapsed ? (
    <Tooltip label={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function Section({
  title,
  collapsed,
  children,
}: {
  title: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      {!collapsed && (
        <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NotebookLink({
  notebook,
  collapsed,
  active,
}: {
  notebook: SidebarNotebook;
  collapsed: boolean;
  active: boolean;
}) {
  const theme = coverTheme(notebook.color);

  const link = (
    <Link
      href={`/n/${notebook.id}`}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-surface font-medium text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <span className="relative shrink-0 text-base leading-none">
        {notebook.icon}
        {notebook.isFavorite && !collapsed && (
          <Star className="absolute -right-1 -top-1 size-2.5 fill-amber-400 text-amber-400" />
        )}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{notebook.title}</span>
          <span
            className={cn(
              "shrink-0 text-[11px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100",
              theme.text,
            )}
          >
            {notebook.pageCount}
          </span>
        </>
      )}
    </Link>
  );

  return collapsed ? (
    <Tooltip label={notebook.title} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}
