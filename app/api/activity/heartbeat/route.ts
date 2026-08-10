import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { heartbeat } from "@/lib/services/activity";

/**
 * Study-session heartbeat.
 *
 * The editor pings this while the tab is visible and actually being used.
 * Duration accumulates from the gaps between pings, so a tab left open
 * overnight doesn't turn into ten hours of "studying" — which is the whole
 * difference between a real number and a vanity metric.
 */

const schema = z.object({
  notebookId: z.string().uuid().nullable().optional(),
  pageId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // A heartbeat with no body is still a valid heartbeat.
  }

  const parsed = schema.safeParse(body ?? {});
  const result = await heartbeat({
    userId: user.id,
    notebookId: parsed.success ? parsed.data.notebookId : null,
    pageId: parsed.success ? parsed.data.pageId : null,
  });

  return NextResponse.json(result);
}
