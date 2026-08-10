"use client";

import * as React from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-4xl tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          Your notebooks are safe — this was a problem loading the page, not
          with your saved work.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-xs text-muted-foreground/70">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-7 flex justify-center gap-2">
          <Button variant="accent" onClick={reset}>
            <RefreshCw />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to notebooks</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
