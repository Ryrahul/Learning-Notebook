import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { listNotebooks, type NotebookSort } from "@/lib/services/notebooks";
import { recentPages } from "@/lib/services/pages";
import { getStudyStats } from "@/lib/services/activity";
import { NotebookShelf } from "../_components/notebook-shelf";

export const metadata: Metadata = { title: "Your notebooks" };

const SORTS = new Set<NotebookSort>([
  "recent",
  "alphabetical",
  "created",
  "manual",
]);

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await requireUser();
  const params = await props.searchParams;

  const rawSort = typeof params.sort === "string" ? params.sort : "recent";
  const sort = SORTS.has(rawSort as NotebookSort)
    ? (rawSort as NotebookSort)
    : "recent";

  const filterParam = typeof params.filter === "string" ? params.filter : "all";
  const filter =
    filterParam === "favorites" || filterParam === "archived"
      ? filterParam
      : "all";

  const query = typeof params.q === "string" ? params.q : "";

  const [notebooks, recent, stats] = await Promise.all([
    listNotebooks(user.id, { sort, filter, query }),
    recentPages(user.id, 6),
    getStudyStats(user.id),
  ]);

  return (
    <NotebookShelf
      userName={user.name}
      notebooks={notebooks.map((n) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        icon: n.icon,
        color: n.color,
        pageCount: n.pageCount,
        isFavorite: n.isFavorite,
        isArchived: n.isArchived,
        updatedAt: n.updatedAt,
        lastOpenedAt: n.lastOpenedAt,
      }))}
      recentPages={recent.map((p) => ({
        id: p.id,
        title: p.title,
        notebookId: p.notebookId,
        notebookTitle: p.notebookTitle,
        notebookIcon: p.notebookIcon,
        notebookColor: p.notebookColor,
        thumbnail: p.thumbnail,
        lastEditedAt: p.lastEditedAt,
      }))}
      stats={{
        currentStreak: stats.currentStreak,
        secondsThisWeek: stats.secondsThisWeek,
        pagesCreatedThisWeek: stats.pagesCreatedThisWeek,
      }}
      sort={sort}
      filter={filter}
      query={query}
    />
  );
}
