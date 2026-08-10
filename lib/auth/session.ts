import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/**
 * The session for this request.
 *
 * `cache()` dedupes across a render pass, so a layout, a page and three server
 * components asking "who is this" cost one lookup rather than five.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session?.user) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image };
});

/**
 * Authoritative gate for every authenticated route and server action.
 *
 * `proxy.ts` only does an optimistic cookie check for fast redirects; this is
 * the check that actually decides access, and it runs on the server next to
 * the data it protects.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
