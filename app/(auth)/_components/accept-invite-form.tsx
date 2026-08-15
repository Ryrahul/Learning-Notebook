"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { redeemInviteAction } from "@/lib/actions/invites";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";

export function AcceptInviteForm({
  token,
  name,
  email,
}: {
  token: string;
  name: string;
  email: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    setPending(true);
    let result;
    try {
      result = await redeemInviteAction(token, password);
    } catch {
      setPending(false);
      setError("Could not reach the server. Check your connection and try again.");
      return;
    }

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }

    // The account exists now; sign in with the credentials just set.
    const signIn = await authClient.signIn.email({ email, password });
    setPending(false);

    if (signIn.error) {
      toast.success("Account created — please sign in.");
      router.push("/login");
      return;
    }

    toast.success("Welcome to your notebook");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="font-display text-4xl tracking-tight">
          You&rsquo;re in, {name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a password for <span className="font-medium">{email}</span> and
          your notebook is ready.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            autoFocus
            required
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
          Create my account
        </Button>
      </form>
    </div>
  );
}
