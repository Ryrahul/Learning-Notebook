import { Suspense } from "react";
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

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    // AuthForm reads `?next=` via useSearchParams, which requires a Suspense
    // boundary so the rest of the page can prerender.
    <Suspense fallback={<AuthFormFallback />}>
      <AuthForm mode="sign-in" signupEnabled={signupEnabled} />
    </Suspense>
  );
}
