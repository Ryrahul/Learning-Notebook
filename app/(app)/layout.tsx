import { requireUser } from "@/lib/auth/session";
import { getOrCreateWorkspace } from "@/lib/services/workspace";
import { listNotebooks } from "@/lib/services/notebooks";
import { AppSidebar } from "./_components/app-sidebar";
import { CommandPalette } from "./_components/command-palette";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // First visit creates the workspace, so every downstream query has one.
  await getOrCreateWorkspace(user.id);

  const notebooks = await listNotebooks(user.id, { sort: "recent", limit: 300 });

  return (
    <div className="flex min-h-dvh">
      <AppSidebar
        user={user}
        notebooks={notebooks.map((n) => ({
          id: n.id,
          title: n.title,
          icon: n.icon,
          color: n.color,
          pageCount: n.pageCount,
          isFavorite: n.isFavorite,
        }))}
      />
      <div className="min-w-0 flex-1">{children}</div>
      <CommandPalette />
    </div>
  );
}
