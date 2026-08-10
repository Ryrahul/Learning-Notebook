import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        {/* A torn-out page — the notebook metaphor for "this isn't here". */}
        <div className="mx-auto mb-6 flex w-fit gap-2" aria-hidden>
          <span className="grid h-24 w-18 place-items-center rounded-lg border border-border bg-paper text-3xl shadow-paper [clip-path:polygon(0_0,100%_0,100%_78%,72%_100%,0_100%)]">
            📄
          </span>
        </div>
        <h1 className="font-display text-4xl tracking-tight">
          This page isn’t here
        </h1>
        <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          It may have been deleted, or the link may be pointing at a notebook
          that isn’t yours.
        </p>
        <div className="mt-7 flex justify-center gap-2">
          <Button asChild variant="accent">
            <Link href="/dashboard">Back to your notebooks</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/search">Search</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
