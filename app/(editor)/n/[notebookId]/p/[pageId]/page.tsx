import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { getPageContext, listPages } from "@/lib/services/pages";
import { loadDocument } from "@/lib/services/documents";
import { loadPageAssets } from "@/lib/services/assets";
import type { PaperStyle } from "@/lib/canvas/types";
import { PageEditor } from "@/components/canvas/page-editor";

export async function generateMetadata(
  props: PageProps<"/n/[notebookId]/p/[pageId]">,
): Promise<Metadata> {
  const { pageId } = await props.params;
  const user = await requireUser();
  const context = await getPageContext(user.id, pageId);
  if (!context) return { title: "Page" };
  return { title: `${context.page.title} · ${context.notebook.title}` };
}

export default async function EditorPage(
  props: PageProps<"/n/[notebookId]/p/[pageId]">,
) {
  const { notebookId, pageId } = await props.params;
  const user = await requireUser();

  const context = await getPageContext(user.id, pageId);
  // Ownership is proven by the query; a mismatched notebook in the URL is a
  // bad link rather than a valid route.
  if (!context || context.page.notebookId !== notebookId) notFound();

  const [document, assets, pages] = await Promise.all([
    loadDocument(user.id, pageId),
    loadPageAssets(user.id, pageId),
    listPages(user.id, notebookId),
  ]);

  if (!document) notFound();

  return (
    <PageEditor
      page={{
        id: context.page.id,
        title: context.page.title,
        notebookId: context.page.notebookId,
        paperStyle: context.page.paperStyle as PaperStyle,
      }}
      notebook={context.notebook}
      position={{
        index: context.index,
        total: context.total,
        previousPageId: context.previousPageId,
        nextPageId: context.nextPageId,
      }}
      pages={pages.map((p, index) => ({
        id: p.id,
        title: p.title,
        thumbnail: p.thumbnail,
        number: index + 1,
      }))}
      document={{
        elements: document.elements,
        appState: document.appState,
        version: document.version,
        updatedAt: document.updatedAt.toISOString(),
      }}
      assets={assets}
    />
  );
}
