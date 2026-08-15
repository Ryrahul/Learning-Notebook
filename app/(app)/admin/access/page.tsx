import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { listAccessRequests } from "@/lib/services/access-requests";
import { AccessRequestsView } from "../../_components/access-requests-view";

export const metadata: Metadata = { title: "Access requests" };
export const dynamic = "force-dynamic";

export default async function AccessRequestsPage() {
  const user = await requireUser();
  // 404 rather than 403: a non-admin should not learn this route exists.
  if (!isAdmin(user)) notFound();

  const requests = await listAccessRequests();

  return (
    <AccessRequestsView
      requests={requests.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        redeemedAt: r.redeemedAt,
        inviteExpiresAt: r.inviteExpiresAt,
      }))}
    />
  );
}
