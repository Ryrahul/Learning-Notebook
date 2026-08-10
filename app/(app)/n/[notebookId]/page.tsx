import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { getNotebook, touchNotebook } from "@/lib/services/notebooks";
import { listPages } from "@/lib/services/pages";
import { getTimeline } from "@/lib/services/activity";
import { NotebookView } from "../../_components/notebook-view";

export async function generateMetadata(
  props: PageProps<"/n/[notebookId]">,
): Promise<Metadata> {
  const { notebookId } = await props.params;
  const user = await requireUser();
  const notebook = await getNotebook(user.id, notebookId);
  return { title: notebook?.title ?? "Notebook" };
}

export default async function NotebookPage(
  props: PageProps<"/n/[notebookId]">,
) {
  const { notebookId } = await props.params;
  const user = await requireUser();

  const notebook = await getNotebook(user.id, notebookId);
  if (!notebook) notFound();

  const [pages, timeline] = await Promise.all([
    listPages(user.id, notebookId),
    getTimeline(user.id, { notebookId, limit: 12 }),
    // Fire-and-forget: "recently opened" ordering shouldn't delay the render.
    touchNotebook(user.id, notebookId),
  ]);

  return (
    <NotebookView
      notebook={{
        id: notebook.id,
        title: notebook.title,
        description: notebook.description,
        icon: notebook.icon,
        color: notebook.color,
        isFavorite: notebook.isFavorite,
        isArchived: notebook.isArchived,
        updatedAt: notebook.updatedAt,
        createdAt: notebook.createdAt,
        pageCount: notebook.pageCount,
      }}
      pages={pages}
      timeline={timeline.map((entry) => ({
        id: entry.id,
        type: entry.type,
        occurredAt: entry.occurredAt,
        pageTitle: entry.pageTitle,
        pageId: entry.pageId,
      }))}
    />
  );
}
