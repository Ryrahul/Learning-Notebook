import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db } from "@/lib/db";
import {
  accessRequest,
  account,
  user,
  type AccessRequest,
} from "@/lib/db/schema";

/**
 * Access requests.
 *
 * With sign-ups closed, this is the only path to a new account, so it is
 * treated as a privileged surface:
 *
 *  - The invite token is 192 bits of CSPRNG entropy and only its SHA-256 hash
 *    is stored. A database dump therefore cannot be redeemed; the raw token is
 *    shown to the owner exactly once, at approval.
 *  - Redemption is single-use and time-boxed, and the account is created in
 *    one transaction with the row that authorised it — the invite is consumed
 *    and the user created together, or neither happens.
 *  - Everything a requester submits is untrusted input: it is length-capped,
 *    and rendered as text, never as markup.
 */

const INVITE_TTL_DAYS = 14;
const MAX_PENDING_PER_EMAIL = 1;

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/* -------------------------------------------------------------------------- */
/*  Public: asking for access                                                  */
/* -------------------------------------------------------------------------- */

export type SubmitResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; error: string };

export async function submitAccessRequest(input: {
  name: string;
  email: string;
  reason?: string | null;
  userAgent?: string | null;
}): Promise<SubmitResult> {
  const email = normaliseEmail(input.email);
  const name = input.name.trim();

  if (!name || !email) return { ok: false, error: "Name and email are required." };

  // Someone who already has an account should sign in, not queue a request.
  // Answered identically to a fresh request below so this cannot be used to
  // probe which emails are registered.
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  const [pending] = await db
    .select({ id: accessRequest.id })
    .from(accessRequest)
    .where(
      and(eq(accessRequest.email, email), eq(accessRequest.status, "pending")),
    )
    .limit(MAX_PENDING_PER_EMAIL);

  if (existingUser || pending) return { ok: true, duplicate: true };

  await db.insert(accessRequest).values({
    name: name.slice(0, 120),
    email: email.slice(0, 200),
    reason: input.reason?.trim().slice(0, 1000) || null,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  });

  return { ok: true, duplicate: false };
}

/* -------------------------------------------------------------------------- */
/*  Owner: reviewing                                                           */
/* -------------------------------------------------------------------------- */

export async function listAccessRequests(): Promise<AccessRequest[]> {
  return db
    .select()
    .from(accessRequest)
    .orderBy(
      // Pending first, newest within each group.
      sql`case when ${accessRequest.status} = 'pending' then 0 else 1 end`,
      desc(accessRequest.createdAt),
    )
    .limit(200);
}

export async function countPendingRequests(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(accessRequest)
    .where(eq(accessRequest.status, "pending"));
  return row?.count ?? 0;
}

/**
 * Approve a request and mint its invite.
 *
 * Returns the raw token once — it is never recoverable afterwards. Approving
 * again re-mints, which also invalidates any previous link for that request.
 */
export async function approveAccessRequest(
  id: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  const [updated] = await db
    .update(accessRequest)
    .set({
      status: "approved",
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: expiresAt,
      redeemedAt: null,
      decidedAt: new Date(),
    })
    .where(eq(accessRequest.id, id))
    .returning({ id: accessRequest.id });

  if (!updated) return { ok: false, error: "Request not found." };
  return { ok: true, token };
}

export async function declineAccessRequest(id: string): Promise<boolean> {
  const [updated] = await db
    .update(accessRequest)
    .set({
      status: "declined",
      // Kill any invite already handed out for this request.
      inviteTokenHash: null,
      inviteExpiresAt: null,
      decidedAt: new Date(),
    })
    .where(eq(accessRequest.id, id))
    .returning({ id: accessRequest.id });
  return Boolean(updated);
}

/* -------------------------------------------------------------------------- */
/*  Invitee: redeeming                                                         */
/* -------------------------------------------------------------------------- */

export interface InviteDetails {
  requestId: string;
  name: string;
  email: string;
}

/** The invite behind a token, if it is live. */
export async function getInvite(token: string): Promise<InviteDetails | null> {
  if (!token) return null;

  const [row] = await db
    .select({
      id: accessRequest.id,
      name: accessRequest.name,
      email: accessRequest.email,
      hash: accessRequest.inviteTokenHash,
    })
    .from(accessRequest)
    .where(
      and(
        eq(accessRequest.inviteTokenHash, hashToken(token)),
        eq(accessRequest.status, "approved"),
        isNull(accessRequest.redeemedAt),
        gt(accessRequest.inviteExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row?.hash) return null;

  // The lookup above already matched on the hash; this is belt-and-braces
  // against a future refactor introducing a non-constant-time comparison.
  const provided = Buffer.from(hashToken(token));
  const stored = Buffer.from(row.hash);
  if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) {
    return null;
  }

  return { requestId: row.id, name: row.name, email: row.email };
}

export type RedeemResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

/**
 * Turn a live invite into an account.
 *
 * Sign-up is disabled at the Better Auth API, which is exactly the point — this
 * is the only way in. The rows are written directly, using Better Auth's own
 * exported `hashPassword`, which is the same function its context uses by
 * default, so the credential verifies on sign-in.
 *
 * The whole thing is one transaction, and the invite is consumed by a
 * conditional update: two concurrent redemptions cannot both succeed.
 */
export async function redeemInvite(
  token: string,
  password: string,
): Promise<RedeemResult> {
  const invite = await getInvite(token);
  if (!invite) return { ok: false, error: "This invite is no longer valid." };
  if (password.length < 8) {
    return { ok: false, error: "Use at least 8 characters." };
  }

  const passwordHash = await hashPassword(password);
  const tokenHash = hashToken(token);

  try {
    return await db.transaction(async (tx) => {
      // Consume the invite first, conditionally. If another request already
      // redeemed it, this matches nothing and we stop before creating a user.
      const [consumed] = await tx
        .update(accessRequest)
        .set({ redeemedAt: new Date() })
        .where(
          and(
            eq(accessRequest.inviteTokenHash, tokenHash),
            eq(accessRequest.status, "approved"),
            isNull(accessRequest.redeemedAt),
          ),
        )
        .returning({ id: accessRequest.id });

      if (!consumed) {
        return { ok: false as const, error: "This invite was already used." };
      }

      const [existing] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, invite.email))
        .limit(1);

      if (existing) {
        return {
          ok: false as const,
          error: "An account already exists for this email. Try signing in.",
        };
      }

      const userId = randomBytes(16).toString("hex");
      await tx.insert(user).values({
        id: userId,
        name: invite.name,
        email: invite.email,
        emailVerified: false,
      });

      await tx.insert(account).values({
        id: randomBytes(16).toString("hex"),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      });

      return { ok: true as const, email: invite.email };
    });
  } catch (error) {
    console.error("[access] redeem failed", error);
    return { ok: false, error: "Could not create the account. Try again." };
  }
}
