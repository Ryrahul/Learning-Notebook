import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { workspace, type Workspace } from "@/lib/db/schema";

/**
 * Every user gets a workspace on first use.
 *
 * Created lazily rather than in a sign-up hook so a user who was created by
 * any other path (seed script, future OAuth provider, admin import) still ends
 * up with somewhere to put notebooks.
 */
export async function getOrCreateWorkspace(
  userId: string,
): Promise<Workspace> {
  const existing = await db.query.workspace.findFirst({
    where: eq(workspace.ownerId, userId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(workspace)
    .values({ ownerId: userId, name: "My Study Space" })
    .returning();

  return created;
}
