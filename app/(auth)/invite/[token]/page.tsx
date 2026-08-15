import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getInvite } from "@/lib/services/access-requests";
import { AcceptInviteForm } from "../../_components/accept-invite-form";

export const metadata: Metadata = {
  title: "Accept your invite",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function InvitePage(
  props: PageProps<"/invite/[token]">,
) {
  const { token } = await props.params;

  // Expired, already used, declined or bogus all look identical — a 404 tells
  // a probe nothing about which invites exist.
  const invite = await getInvite(token);
  if (!invite) notFound();

  return (
    <AcceptInviteForm token={token} name={invite.name} email={invite.email} />
  );
}
