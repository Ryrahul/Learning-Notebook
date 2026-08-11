"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import * as sharing from "@/lib/services/sharing";

export type ShareResult =
  | { ok: true; shareToken: string | null; visibility: "private" | "link" }
  | { ok: false; error: string };

function present(state: sharing.ShareState | null): ShareResult {
  if (!state) return { ok: false, error: "Notebook not found." };
  return {
    ok: true,
    shareToken: state.shareToken,
    visibility: state.visibility,
  };
}

export async function enableSharingAction(
  notebookId: string,
): Promise<ShareResult> {
  const user = await requireUser();
  const state = await sharing.enableSharing(user.id, notebookId);
  revalidatePath(`/n/${notebookId}`);
  return present(state);
}

export async function disableSharingAction(
  notebookId: string,
): Promise<ShareResult> {
  const user = await requireUser();
  const state = await sharing.disableSharing(user.id, notebookId);
  revalidatePath(`/n/${notebookId}`);
  return present(state);
}

export async function rotateShareLinkAction(
  notebookId: string,
): Promise<ShareResult> {
  const user = await requireUser();
  const state = await sharing.rotateShareLink(user.id, notebookId);
  revalidatePath(`/n/${notebookId}`);
  return present(state);
}
