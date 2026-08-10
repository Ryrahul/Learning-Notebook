import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { quickFind } from "@/lib/services/search";

/**
 * Type-ahead lookup for the command palette.
 *
 * A route handler rather than a server action: this fires on nearly every
 * keystroke and needs to be cheaply abortable from the client.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await quickFind(user.id, query);

  return NextResponse.json(results);
}
