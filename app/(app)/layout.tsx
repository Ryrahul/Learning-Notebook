import { requireUser } from "@/lib/auth/session";
import { getOrCreateWorkspace } from "@/lib/services/workspace";
import { listNotebooks } from "@/lib/services/notebooks";
import { isAdmin } from "@/lib/auth/admin";
import { countPendingRequests } from "@/lib/services/access-requests";
import { AppShell } from "./_components/app-shell";
import { CommandPalette } from "./_components/command-palette";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // First visit creates the workspace, so every downstream query has one.
  await getOrCreateWorkspace(user.id);

  const notebooks = await listNotebooks(user.id, { sort: "recent", limit: 300 });

  // Only an admin sees the access queue, and only an admin pays for the count.
  const admin = isAdmin(user);
  const pendingRequests = admin ? await countPendingRequests() : 0;

  return (
    <>
      <AppShell
        user={user}
        isAdmin={admin}
        pendingRequests={pendingRequests}
        notebooks={notebooks.map((n) => ({
          id: n.id,
          title: n.title,
          icon: n.icon,
          color: n.color,
          pageCount: n.pageCount,
          isFavorite: n.isFavorite,
        }))}
      >
        {children}
      </AppShell>
      <CommandPalette />
    </>
  );
}
