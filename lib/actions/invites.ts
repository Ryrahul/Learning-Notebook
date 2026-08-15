"use server";

import { redeemInvite } from "@/lib/services/access-requests";

/**
 * Public by necessity — the caller has no session yet. The invite token is the
 * only credential, and the service verifies it is live, unused and unexpired
 * before creating anything.
 */
export async function redeemInviteAction(
  token: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await redeemInvite(token, password);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
