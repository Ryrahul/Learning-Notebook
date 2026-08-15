import "server-only";

import type { CurrentUser } from "./session";

/**
 * Who may review access requests.
 *
 * A comma-separated allowlist rather than a role column: this deployment has
 * exactly one owner, and keeping the privilege in configuration means it can
 * never be granted by writing to a table the app itself can write to.
 *
 * Compared case-insensitively; an unset variable means nobody is an admin, so
 * the admin surface fails closed.
 */
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdmin(user: Pick<CurrentUser, "email"> | null): boolean {
  if (!user?.email) return false;
  return adminEmails.has(user.email.toLowerCase());
}

export function adminConfigured(): boolean {
  return adminEmails.size > 0;
}
