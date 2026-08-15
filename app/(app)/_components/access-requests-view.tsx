"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Inbox, Link2, X } from "lucide-react";
import { toast } from "sonner";

import {
  approveAccessRequestAction,
  declineAccessRequestAction,
} from "@/lib/actions/access-requests";
import type { AccessRequestStatus } from "@/lib/db/schema";
import { cn, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { RelativeTime } from "@/components/relative-time";

interface Row {
  id: string;
  name: string;
  email: string;
  reason: string | null;
  status: AccessRequestStatus;
  createdAt: Date;
  redeemedAt: Date | null;
  inviteExpiresAt: Date | null;
}

export function AccessRequestsView({ requests }: { requests: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  /** Raw invite links, held in memory only — they are never stored. */
  const [links, setLinks] = React.useState<Record<string, string>>({});

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  async function approve(row: Row) {
    setBusy(row.id);
    const result = await approveAccessRequestAction(row.id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const url = `${window.location.origin}/invite/${result.token}`;
    setLinks((current) => ({ ...current, [row.id]: url }));
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success(`Approved — invite link copied. Send it to ${row.name}.`);
    router.refresh();
  }

  async function decline(row: Row) {
    setBusy(row.id);
    const result = await declineAccessRequestAction(row.id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? "Could not decline.");
      return;
    }
    toast.success("Declined");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-8">
        <h1 className="font-display text-4xl tracking-tight">Access requests</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign-ups are closed, so this is the only way in. Approving creates an
          invite link you send to them yourself.
        </p>
      </header>

      {pending.length === 0 && decided.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center">
          <Inbox className="mx-auto mb-4 size-6 text-muted-foreground" />
          <p className="font-display text-2xl tracking-tight">No requests yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            They&rsquo;ll appear here as soon as someone asks.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Waiting on you · {pluralize(pending.length, "request")}
              </h2>
              <div className="space-y-2">
                {pending.map((row) => (
                  <RequestCard
                    key={row.id}
                    row={row}
                    link={links[row.id]}
                    busy={busy === row.id}
                    onApprove={() => approve(row)}
                    onDecline={() => decline(row)}
                  />
                ))}
              </div>
            </section>
          )}

          {decided.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Decided
              </h2>
              <div className="space-y-2">
                {decided.map((row) => (
                  <RequestCard
                    key={row.id}
                    row={row}
                    link={links[row.id]}
                    busy={busy === row.id}
                    onApprove={() => approve(row)}
                    onDecline={() => decline(row)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RequestCard({
  row,
  link,
  busy,
  onApprove,
  onDecline,
}: {
  row: Row;
  link?: string;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-paper">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {row.name}
            {row.status === "approved" && (
              <Badge variant={row.redeemedAt ? "success" : "accent"}>
                {row.redeemedAt ? "Joined" : "Invited"}
              </Badge>
            )}
            {row.status === "declined" && <Badge variant="outline">Declined</Badge>}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {row.email}
          </p>
          {/* Untrusted text from a stranger — rendered as text, never markup. */}
          {row.reason && (
            <p className="mt-2 max-w-prose whitespace-pre-wrap rounded-lg bg-surface-muted p-2.5 text-sm leading-relaxed">
              {row.reason}
            </p>
          )}
          <RelativeTime
            date={row.createdAt}
            className="mt-2 block text-xs text-muted-foreground"
            prefix="Asked "
          />
        </div>

        {row.status === "pending" && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="accent" loading={busy} onClick={onApprove}>
              <Check />
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onDecline}>
              <X />
              Decline
            </Button>
          </div>
        )}
      </div>

      {link && (
        <div className="mt-3 space-y-1.5 animate-rise-in">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-surface-muted px-3 py-2">
              <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                readOnly
                value={link}
                onFocus={(event) => event.currentTarget.select()}
                aria-label={`Invite link for ${row.name}`}
                className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(link).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className={cn("text-[11px] text-muted-foreground")}>
            Send this to {row.name}. It works once and expires in 14 days — and
            it is shown here only now, so copy it before you leave the page.
          </p>
        </div>
      )}
    </div>
  );
}
