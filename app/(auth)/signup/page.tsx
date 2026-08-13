import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { signupEnabled } from "@/lib/auth/signup-policy";

import { AuthForm } from "../_components/auth-form";
import { AuthFormFallback } from "../_components/auth-form-fallback";

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
