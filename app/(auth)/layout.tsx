import Link from "next/link";
import { NotebookPen } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Form side */}
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-medium tracking-tight"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
              <NotebookPen className="size-4" />
            </span>
            Notebook
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-rise-in">{children}</div>
        </main>

        <footer className="text-xs text-muted-foreground">
          Your notebooks stay private to your account.
        </footer>
      </div>

      {/* Poster side — a stack of notebook spines, so the product's mental
          model is visible before you've signed up. */}
      <aside className="relative hidden overflow-hidden bg-surface-muted lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--accent)/0.16),transparent_55%)]" />
        <div className="paper-grain absolute inset-0" />

        <div className="relative flex h-full flex-col justify-center gap-8 px-16">
          <div className="space-y-4">
            <h2 className="font-display text-5xl leading-[1.05] tracking-tight">
              A shelf full of
              <br />
              digital notebooks.
            </h2>
            <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Every page is an infinite canvas. Write by hand, sketch diagrams,
              paste screenshots, highlight what matters — all of it saved
              automatically and tracked as study progress.
            </p>
          </div>

          <div className="flex gap-3">
            {[
              { icon: "📘", title: "System Design", pages: 42, tint: "indigo" },
              { icon: "🎨", title: "UI / UX", pages: 18, tint: "rose" },
              { icon: "💻", title: "Backend", pages: 27, tint: "teal" },
            ].map((nb, i) => (
              <div
                key={nb.title}
                className="flex h-52 w-36 flex-col justify-between rounded-xl border border-border bg-surface p-4 shadow-lifted transition-transform"
                style={{
                  transform: `rotate(${(i - 1) * 2.5}deg) translateY(${i === 1 ? -10 : 0}px)`,
                }}
              >
                <span className="text-2xl">{nb.icon}</span>
                <div>
                  <p className="text-sm font-medium leading-tight">{nb.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {nb.pages} pages
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
