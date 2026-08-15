"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import * as access from "@/lib/services/access-requests";

const requestSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name.").max(120),
  email: z.email("Enter a valid email address.").max(200),
  reason: z.string().trim().max(1000).optional(),
});

/** Public — anyone may ask. */
export async function submitAccessRequestAction(
  input: z.input<typeof requestSchema>,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const requestHeaders = await headers();
  const result = await access.submitAccessRequest({
    ...parsed.data,
    userAgent: requestHeaders.get("user-agent"),
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Every action below is admin-only. The check lives here rather than in a
 * layout so a new caller cannot reach these without passing it.
 */
async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Not authorised");
  return user;
}

export async function approveAccessRequestAction(
  id: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  await requireAdmin();
  const result = await access.approveAccessRequest(id);
  revalidatePath("/admin/access");
  return result;
}

export async function declineAccessRequestAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const done = await access.declineAccessRequest(id);
  revalidatePath("/admin/access");
  return done ? { ok: true } : { ok: false, error: "Request not found." };
}
