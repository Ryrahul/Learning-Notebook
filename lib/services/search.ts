import "server-only";

import { and, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { notebook, page } from "@/lib/db/schema";

/**
 * Search across the workspace.
 *
 * Postgres full-text, no external index. Page bodies are matched against the
 * generated `search_vector` (title weighted A, canvas text weighted B), so
 * results rank sensibly and the index can never fall out of sync with the row.
 */

export interface NotebookHit {
  kind: "notebook";
  id: string;
  title: string;
  icon: string;
  color: string;
  pageCount: number;
}

export interface PageHit {
  kind: "page";
  id: string;
  title: string;
  notebookId: string;
  notebookTitle: string;
  notebookIcon: string;
  excerpt: string | null;
  lastEditedAt: Date;
  rank: number;
}

export interface SearchResults {
  query: string;
  notebooks: NotebookHit[];
  pages: PageHit[];
}

export async function search(
  userId: string,
  rawQuery: string,
  options: { limit?: number } = {},
): Promise<SearchResults> {
  const query = rawQuery.trim();
  const limit = options.limit ?? 30;

  if (query.length === 0) {
    return { query, notebooks: [], pages: [] };
  }

  const [notebooks, pages] = await Promise.all([
    searchNotebooks(userId, query, Math.ceil(limit / 3)),
    searchPages(userId, query, limit),
  ]);

  return { query, notebooks, pages };
}

async function searchNotebooks(
  userId: string,
  query: string,
  limit: number,
): Promise<NotebookHit[]> {
  const rows = await db
    .select({
      id: notebook.id,
      title: notebook.title,
      icon: notebook.icon,
      color: notebook.color,
      pageCount: notebook.pageCount,
    })
    .from(notebook)
    .where(
      and(
        eq(notebook.ownerId, userId),
        eq(notebook.isArchived, false),
        or(
          ilike(notebook.title, `%${query}%`),
          ilike(notebook.description, `%${query}%`),
        ),
      ),
    )
    .limit(limit);

  return rows.map((row) => ({ kind: "notebook" as const, ...row }));
}

async function searchPages(
  userId: string,
  query: string,
  limit: number,
): Promise<PageHit[]> {
  // `websearch_to_tsquery` accepts what people actually type — quoted phrases,
  // OR, leading minus — without throwing on syntax the way `to_tsquery` does.
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;

  const rows = await db
    .select({
      id: page.id,
      title: page.title,
      notebookId: page.notebookId,
      notebookTitle: notebook.title,
      notebookIcon: notebook.icon,
      lastEditedAt: page.lastEditedAt,
      rank: sql<number>`ts_rank(${page.searchVector}, ${tsQuery})`,
      excerpt: sql<string | null>`
        nullif(
          ts_headline(
            'english',
            ${page.textContent},
            ${tsQuery},
            'StartSel=<mark>, StopSel=</mark>, MaxWords=22, MinWords=6, ShortWord=3, MaxFragments=1'
          ),
          ''
        )
      `,
    })
    .from(page)
    .innerJoin(notebook, eq(page.notebookId, notebook.id))
    .where(
      and(
        eq(page.ownerId, userId),
        eq(page.isDeleted, false),
        eq(notebook.isArchived, false),
        sql`${page.searchVector} @@ ${tsQuery}`,
      ),
    )
    .orderBy(sql`ts_rank(${page.searchVector}, ${tsQuery}) desc`)
    .limit(limit);

  return rows.map((row) => ({ kind: "page" as const, ...row }));
}

/**
 * Fast title-only lookup for the command palette, where results must appear
 * as the user types and full-text ranking would be overkill.
 */
export async function quickFind(userId: string, rawQuery: string, limit = 12) {
  const query = rawQuery.trim();
  if (!query) return { notebooks: [], pages: [] };

  const [notebooks, pages] = await Promise.all([
    db
      .select({
        id: notebook.id,
        title: notebook.title,
        icon: notebook.icon,
        color: notebook.color,
      })
      .from(notebook)
      .where(
        and(
          eq(notebook.ownerId, userId),
          eq(notebook.isArchived, false),
          ilike(notebook.title, `%${query}%`),
        ),
      )
      .limit(limit),
    db
      .select({
        id: page.id,
        title: page.title,
        notebookId: page.notebookId,
        notebookTitle: notebook.title,
        notebookIcon: notebook.icon,
      })
      .from(page)
      .innerJoin(notebook, eq(page.notebookId, notebook.id))
      .where(
        and(
          eq(page.ownerId, userId),
          eq(page.isDeleted, false),
          eq(notebook.isArchived, false),
          ilike(page.title, `%${query}%`),
        ),
      )
      .limit(limit),
  ]);

  return { notebooks, pages };
}
