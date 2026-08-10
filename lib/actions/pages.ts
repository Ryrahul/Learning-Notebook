"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { PAPER_STYLES } from "@/lib/db/schema";
import * as pages from "@/lib/services/pages";

export type ActionState = { ok: boolean; error?: string };

const paperStyleSchema = z.enum(PAPER_STYLES);

export async function createPageAction(
  notebookId: string,
  input: { title?: string; afterPageId?: string; paperStyle?: string } = {},
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();

  const created = await pages.createPage(user.id, notebookId, {
    title: input.title?.trim() || undefined,
    afterPageId: input.afterPageId,
    paperStyle: paperStyleSchema.optional().catch(undefined).parse(input.paperStyle),
  });

  if (!created) return { ok: false, error: "Notebook not found." };

  revalidatePath(`/n/${notebookId}`);
  revalidatePath("/dashboard");
  return { ok: true, id: created.id };
}

/** Create a page and navigate into the editor — the primary "new page" path. */
export async function createPageAndOpen(notebookId: string) {
  const user = await requireUser();
  const created = await pages.createPage(user.id, notebookId);
  if (!created) redirect(`/n/${notebookId}`);

  revalidatePath(`/n/${notebookId}`);
  redirect(`/n/${notebookId}/p/${created.id}`);
}

export async function renamePageAction(
  pageId: string,
  title: string,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.string().trim().min(1).max(160).safeParse(title);
  if (!parsed.success) return { ok: false, error: "Enter a page title." };

  const updated = await pages.renamePage(user.id, pageId, parsed.data);
  if (!updated) return { ok: false, error: "Page not found." };

  revalidatePath(`/n/${updated.notebookId}`);
  revalidatePath(`/n/${updated.notebookId}/p/${pageId}`);
  return { ok: true };
}

export async function deletePageAction(
  pageId: string,
  notebookId: string,
): Promise<ActionState> {
  const user = await requireUser();
  const deleted = await pages.deletePage(user.id, pageId);
  if (!deleted) return { ok: false, error: "Page not found." };

  revalidatePath(`/n/${notebookId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function duplicatePageAction(
  pageId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const copy = await pages.duplicatePage(user.id, pageId);
  if (!copy) return { ok: false, error: "Page not found." };

  revalidatePath(`/n/${copy.notebookId}`);
  return { ok: true, id: copy.id };
}

export async function reorderPageAction(
  pageId: string,
  notebookId: string,
  targetIndex: number,
): Promise<ActionState> {
  const user = await requireUser();
  const moved = await pages.reorderPage(user.id, pageId, targetIndex);
  if (!moved) return { ok: false, error: "Page not found." };

  revalidatePath(`/n/${notebookId}`);
  return { ok: true };
}

export async function setPaperStyleAction(
  pageId: string,
  notebookId: string,
  paperStyle: string,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = paperStyleSchema.safeParse(paperStyle);
  if (!parsed.success) return { ok: false, error: "Unknown paper style." };

  await pages.setPaperStyle(user.id, pageId, parsed.data);
  revalidatePath(`/n/${notebookId}/p/${pageId}`);
  return { ok: true };
}
