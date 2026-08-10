import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { loadDocument, saveDocument } from "@/lib/services/documents";
import type { CanvasAppState, CanvasElement } from "@/lib/canvas/types";

/**
 * The autosave endpoint.
 *
 * A route handler rather than a server action: this is called every ~1.2s
 * while drawing and needs real HTTP semantics — `409` for a stale version and
 * `keepalive` so a save can outlive the page being closed.
 */

const saveSchema = z.object({
  elements: z.array(z.record(z.string(), z.unknown())),
  appState: z.record(z.string(), z.unknown()),
  baseVersion: z.number().int().nonnegative(),
  thumbnail: z.string().nullable().optional(),
});

/** Guards against a runaway document filling the row. */
const MAX_ELEMENTS = 50_000;

export async function GET(
  _request: Request,
  context: RouteContext<"/api/pages/[pageId]/document">,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = await context.params;
  const document = await loadDocument(user.id, pageId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(document);
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/pages/[pageId]/document">,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload" },
      { status: 400 },
    );
  }

  if (parsed.data.elements.length > MAX_ELEMENTS) {
    return NextResponse.json(
      { error: "This page has too many objects to save." },
      { status: 413 },
    );
  }

  const result = await saveDocument(user.id, {
    pageId,
    elements: parsed.data.elements as unknown as CanvasElement[],
    appState: parsed.data.appState as CanvasAppState,
    baseVersion: parsed.data.baseVersion,
    thumbnail: parsed.data.thumbnail,
  });

  if (result.status === "not-found") {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  if (result.status === "conflict") {
    // Hand back the current server state so the client can offer a choice
    // rather than quietly discarding one side.
    return NextResponse.json(
      {
        error: "Version conflict",
        serverVersion: result.serverVersion,
        document: {
          elements: result.document.elements,
          appState: result.document.appState,
          version: result.document.version,
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    version: result.version,
    savedAt: result.savedAt,
  });
}
