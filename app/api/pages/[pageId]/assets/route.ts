import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { MAX_ASSET_BYTES, putAsset } from "@/lib/services/assets";
import { recordActivity } from "@/lib/services/activity";

/**
 * Image upload for the canvas.
 *
 * The client posts a data URL because that is the shape the engine hands us
 * when an image is pasted or dropped. We decode it here and store raw bytes,
 * so the canvas document itself never carries base64 payloads through every
 * subsequent autosave.
 */

const assetSchema = z.object({
  id: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  dataURL: z.string().min(1),
});

export async function POST(
  request: Request,
  context: RouteContext<"/api/pages/[pageId]/assets">,
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

  const parsed = assetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid asset" }, { status: 400 });
  }

  const decoded = decodeDataURL(parsed.data.dataURL);
  if (!decoded) {
    return NextResponse.json(
      { error: "Expected a base64 data URL" },
      { status: 400 },
    );
  }

  if (decoded.bytes.byteLength > MAX_ASSET_BYTES) {
    return NextResponse.json(
      { error: "Image is larger than 12 MB." },
      { status: 413 },
    );
  }

  const result = await putAsset({
    userId: user.id,
    pageId,
    fileId: parsed.data.id,
    mimeType: decoded.mimeType || parsed.data.mimeType,
    bytes: decoded.bytes,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  void recordActivity({
    userId: user.id,
    type: "image.added",
    pageId,
    metadata: { byteSize: decoded.bytes.byteLength },
  });

  return NextResponse.json({ ok: true });
}

function decodeDataURL(
  dataURL: string,
): { mimeType: string; bytes: Buffer } | null {
  // `[\s\S]` rather than the `s` flag so this compiles at the project's
  // ES2017 target; base64 payloads may contain line breaks.
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataURL);
  if (!match) return null;
  try {
    return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}
