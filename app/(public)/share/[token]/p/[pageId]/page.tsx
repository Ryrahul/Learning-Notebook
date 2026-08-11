import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getSharedPage } from "@/lib/services/sharing";
import { SharedPageViewer } from "@/components/canvas/shared-page-viewer";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedCanvasPage(
  props: PageProps<"/share/[token]/p/[pageId]">,
) {
  const { token, pageId } = await props.params;

  // The service verifies both that the token is live and that this page
  // actually belongs to the notebook it unlocks.
  const shared = await getSharedPage(token, pageId);
  if (!shared) notFound();

  return (
    <SharedPageViewer
      token={token}
      notebook={{
        title: shared.notebookTitle,
        icon: shared.notebookIcon,
        color: shared.notebookColor,
      }}
      page={shared.page}
      document={shared.document}
      assets={shared.assets}
      position={{
        index: shared.index,
        total: shared.total,
        previousPageId: shared.previousPageId,
        nextPageId: shared.nextPageId,
      }}
      pages={shared.pages}
    />
  );
}
