"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { submitAccessRequestAction } from "@/lib/actions/access-requests";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";

export function RequestAccessForm() {
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const data = Object.fromEntries(new FormData(event.currentTarget));
    let result;
    try {
      result = await submitAccessRequestAction({
        name: String(data.name ?? ""),
        email: String(data.email ?? ""),
        reason: String(data.reason ?? ""),
      });
    } catch {
      setPending(false);
      setError("Could not reach the server. Check your connection and try again.");
      return;
    }

    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-6 animate-rise-in">
        <span className="grid size-11 place-items-center rounded-xl bg-success/12 text-success">
          <CheckCircle2 className="size-5" />
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-4xl tracking-tight">Request sent</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Rahul will review it. If you&rsquo;re approved you&rsquo;ll get a
            personal invite link to set your password — there&rsquo;s nothing
            else to do for now.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Back to the homepage</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="font-display text-4xl tracking-tight">Request access</h1>
        <p className="text-sm text-muted-foreground">
          This notebook is invite-only. Tell us a little about you and
          you&rsquo;ll hear back.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="Ada Lovelace" autoFocus required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reason">Why do you want access?</Label>
          <Textarea
            id="reason"
            name="reason"
            placeholder="Optional — what you'd use it for."
            maxLength={1000}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" variant="accent" loading={pending}>
          Send request
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
