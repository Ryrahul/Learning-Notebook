import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { search } from "@/lib/services/search";
import { SearchView } from "../_components/search-view";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  const params = await props.searchParams;
  const query = typeof params.q === "string" ? params.q : "";

  const user = await requireUser();
  const results = await search(user.id, query, { limit: 40 });

  return (
    <SearchView
      query={query}
      notebooks={results.notebooks}
      pages={results.pages.map((page) => ({
        id: page.id,
        title: page.title,
        notebookId: page.notebookId,
        notebookTitle: page.notebookTitle,
        notebookIcon: page.notebookIcon,
        excerpt: page.excerpt,
        lastEditedAt: page.lastEditedAt,
      }))}
    />
  );
}
