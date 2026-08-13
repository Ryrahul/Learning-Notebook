import { Suspense } from "react";
import type { Metadata } from "next";

import { signupEnabled } from "@/lib/auth/signup-policy";

import { AuthForm } from "../_components/auth-form";
import { AuthFormFallback } from "../_components/auth-form-fallback";

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
