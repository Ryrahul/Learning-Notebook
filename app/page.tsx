import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck,
  Highlighter,
  NotebookPen,
  Search,
  Shapes,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth/session";
import { signupEnabled } from "@/lib/auth/signup-policy";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const FEATURES = [
  {
    icon: Shapes,
    title: "An infinite canvas per page",
    body: "Freehand ink, shapes, arrows that stay attached to the boxes they connect, text you edit right on the page, and images you can drop anywhere.",
  },
  {
    icon: Highlighter,
    title: "Pens that feel like pens",
    body: "Pencil, pen, marker and highlighter — each with its own weight and translucency, on ruled, dotted, grid or plain paper.",
  },
  {
    icon: CalendarCheck,
    title: "Progress you can see",
    body: "Every edit is logged. Streaks, a study heatmap, hours spent and a daily timeline of what you actually worked on.",
  },
  {
    icon: Search,
    title: "Search inside the ink",
    body: "Text written on any canvas is indexed, so finding the page where you sketched Kafka's architecture takes one keystroke.",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2 font-medium tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
            <NotebookPen className="size-4" />
          </span>
          Notebook
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          {signupEnabled && (
            <Button asChild size="sm" variant="accent">
              <Link href="/signup">Get started</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-20 text-center sm:py-28">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            Autosaves while you write
          </p>
          <h1 className="mx-auto max-w-3xl font-display text-6xl leading-[1.02] tracking-tight sm:text-7xl">
            Your studying deserves
            <br />
            a proper notebook.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Hundreds of notebooks. Hundreds of pages in each. Every page an
            infinite canvas you can write on, draw on, and think on.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3">
            {signupEnabled ? (
              <>
                <Button asChild size="lg" variant="accent">
                  <Link href="/signup">
                    Start your first notebook
                    <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">I already have one</Link>
                </Button>
              </>
            ) : (
              <Button asChild size="lg" variant="accent">
                <Link href="/login">
                  Sign in
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-surface p-6 shadow-paper"
            >
              <span className="mb-4 grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon className="size-4.5" />
              </span>
              <h3 className="font-medium tracking-tight">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
