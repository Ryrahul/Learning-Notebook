"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { NOTEBOOK_COLORS } from "@/lib/db/schema";
import * as notebooks from "@/lib/services/notebooks";

/**
 * Server actions for notebook CRUD.
 *
 * Thin by design: validate, delegate to the service (which enforces
 * ownership), revalidate. Anything non-trivial belongs in the service so it
 * stays testable and reusable from route handlers.
 */

const colorSchema = z.enum(NOTEBOOK_COLORS);

const createSchema = z.object({
  title: z.string().trim().min(1, "Give your notebook a name.").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  icon: z.string().trim().min(1).max(8).optional(),
  color: colorSchema.optional(),
});

export type ActionState = { ok: boolean; error?: string };

export async function createNotebookAction(
  input: z.input<typeof createSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const created = await notebooks.createNotebook(user.id, parsed.data);
  revalidatePath("/dashboard");
  return { ok: true, id: created.id };
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().min(1).max(8).optional(),
  color: colorSchema.optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export async function updateNotebookAction(
  notebookId: string,
  input: z.input<typeof updateSchema>,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const updated = await notebooks.updateNotebook(user.id, notebookId, parsed.data);
  if (!updated) return { ok: false, error: "Notebook not found." };

  revalidatePath("/dashboard");
  revalidatePath(`/n/${notebookId}`);
  return { ok: true };
}

export async function deleteNotebookAction(
  notebookId: string,
): Promise<ActionState> {
  const user = await requireUser();
  const deleted = await notebooks.deleteNotebook(user.id, notebookId);
  if (!deleted) return { ok: false, error: "Notebook not found." };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function duplicateNotebookAction(
  notebookId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const copy = await notebooks.duplicateNotebook(user.id, notebookId);
  if (!copy) return { ok: false, error: "Notebook not found." };

  revalidatePath("/dashboard");
  return { ok: true, id: copy.id };
}

export async function reorderNotebookAction(
  notebookId: string,
  targetIndex: number,
): Promise<ActionState> {
  const user = await requireUser();
  await notebooks.reorderNotebook(user.id, notebookId, targetIndex);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Creates a notebook and drops the user straight into it. */
export async function createNotebookAndOpen(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();

  const created = await notebooks.createNotebook(user.id, {
    title: title || "Untitled notebook",
    icon: String(formData.get("icon") ?? "📓"),
    color: colorSchema.catch("indigo").parse(formData.get("color")),
  });

  revalidatePath("/dashboard");
  redirect(`/n/${created.id}`);
}
