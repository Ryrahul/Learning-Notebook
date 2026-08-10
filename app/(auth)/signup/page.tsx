import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthForm } from "../_components/auth-form";
import { AuthFormFallback } from "../_components/auth-form-fallback";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
