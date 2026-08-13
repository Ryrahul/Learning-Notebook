"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Your name needs at least 2 characters."),
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[a-zA-Z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
});

type FieldErrors = Partial<Record<"name" | "email" | "password", string>>;

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSignUp = mode === "sign-up";

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<FieldErrors>({});

  const next = searchParams.get("next") ?? "/dashboard";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const data = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = isSignUp
      ? signUpSchema.safeParse(data)
      : signInSchema.safeParse(data);

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setPending(true);

    // A network failure rejects rather than returning `error`, and an
    // unhandled rejection here left the form silently doing nothing — the
    // user clicks Sign in and gets no feedback at all.
    let result;
    try {
      result = isSignUp
        ? await authClient.signUp.email({
            name: (parsed.data as z.infer<typeof signUpSchema>).name,
            email: parsed.data.email,
            password: parsed.data.password,
          })
        : await authClient.signIn.email({
            email: parsed.data.email,
            password: parsed.data.password,
          });
    } catch (error) {
      setPending(false);
      console.error("[auth] request failed", error);
      setFormError(
        "Could not reach the server. Check your connection and try again.",
      );
      return;
    }

    if (result.error) {
      setPending(false);
      setFormError(
        result.error.message ??
          "Something went wrong. Please check your details and try again.",
      );
      return;
    }

    toast.success(isSignUp ? "Welcome to your notebook" : "Welcome back");
    // `refresh()` re-runs the server layout so the new session is picked up
    // before we land on the destination.
    router.push(next);
    router.refresh();
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="font-display text-4xl tracking-tight">
          {isSignUp ? "Start your notebook" : "Welcome back"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSignUp
            ? "Create an account and your first notebook is one click away."
            : "Sign in to pick up where you left off."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {isSignUp && (
          <Field
            id="name"
            label="Name"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            error={errors.name}
            autoFocus
          />
        )}

        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email}
          autoFocus={!isSignUp}
        />

        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
          error={errors.password}
        />

        {formError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {formError}
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={pending}
          variant="accent"
        >
          {isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : "New here? "}
        <Link
          href={isSignUp ? "/login" : "/signup"}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  ...props
}: React.ComponentProps<"input"> & { id: string; label: string; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={error ? "border-destructive focus-visible:ring-destructive/40" : ""}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
