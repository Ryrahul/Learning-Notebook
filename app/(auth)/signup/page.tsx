import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { signupEnabled } from "@/lib/auth/signup-policy";

import { AuthForm } from "../_components/auth-form";
import { AuthFormFallback } from "../_components/auth-form-fallback";

/**
 * Rendered per request, not prerendered.
 *
 * The sign-up policy is runtime configuration. Prerendering this route bakes
 * whatever the build machine had into static HTML, so a deployment that closed
 * sign-ups still served the form (and never ran the redirect) until the next
 * build.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  // Closed deployments have no sign-up page at all, rather than a form that
  // fails on submit.
  if (!signupEnabled) redirect("/login");

  return (
    <Suspense fallback={<AuthFormFallback />}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
