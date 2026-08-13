"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Clock, Flame, PenLine, Sparkles } from "lucide-react";

import type { ActivityType } from "@/lib/db/schema";
import { cn, formatDuration, pluralize, toDateKey } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

interface DayActivity {
  date: string;
  events: number;
  seconds: number;
}

interface TimelineEntry {
  id: string;
  type: ActivityType;
  occurredAt: Date;
  notebookId: string | null;
  pageId: string | null;
  notebookTitle: string | null;
  pageTitle: string | null;
  notebookIcon: string | null;
}

interface Stats {
  currentStreak: number;
  longestStreak: number;
  totalSeconds: number;
  secondsThisWeek: number;
  sessionsThisWeek: number;
  pagesCreatedThisWeek: number;
  activeDaysThisWeek: number;
}

const WEEKS = 53;

export function ActivityDashboard({
  todayKey,
  daily,
  stats,
  timeline,
}: {
  /** The server's current date (YYYY-MM-DD). See the note in activity/page. */
  todayKey: string;
  daily: DayActivity[];
  stats: Stats;
  timeline: TimelineEntry[];
}) {
  const byDate = React.useMemo(
    () => new Map(daily.map((day) => [day.date, day])),
    [daily],
  );

  const weeks = React.useMemo(() => buildCalendar(todayKey), [todayKey]);

  // Scale intensity to the user's own best day — a fixed scale would make a
  // light week look empty and a heavy week look uniformly maxed out.
  const busiest = React.useMemo(
    () => Math.max(1, ...daily.map((day) => day.events)),
    [daily],
  );

  const grouped = React.useMemo(
    () => groupByDay(timeline, todayKey),
    [timeline, todayKey],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-8">
        <h1 className="font-display text-4xl tracking-tight">Study progress</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Everything you have worked on, and how consistently.
        </p>
      </header>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Flame}
          label="Current streak"
          value={pluralize(stats.currentStreak, "day")}
          hint={
            stats.longestStreak > 0
              ? `Best: ${pluralize(stats.longestStreak, "day")}`
              : undefined
          }
          accent={stats.currentStreak > 0}
        />
        <StatCard
          icon={Clock}
          label="This week"
          value={formatDuration(stats.secondsThisWeek)}
          hint={`${pluralize(stats.sessionsThisWeek, "session")}`}
        />
        <StatCard
          icon={PenLine}
          label="Pages created"
          value={String(stats.pagesCreatedThisWeek)}
          hint="this week"
        />
        <StatCard
          icon={Sparkles}
          label="Total studied"
          value={formatDuration(stats.totalSeconds)}
          hint={`${pluralize(stats.activeDaysThisWeek, "active day")} this week`}
        />
      </section>

      <section className="mb-10 rounded-2xl border border-border bg-surface p-5 shadow-paper">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            Last 12 months
          </h2>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Less
            {[0, 1, 2, 3, 4].map((level) => (
              <span
                key={level}
                className={cn("size-2.5 rounded-[3px]", levelClass(level))}
              />
            ))}
            More
          </div>
        </div>

        <div className="overflow-x-auto pb-1 no-scrollbar">
          <div className="flex gap-[3px]">
            {/* Weekday gutter — only alternate labels, or it turns to mush. */}
            <div className="mr-1 flex shrink-0 flex-col gap-[3px] pt-[15px] text-[9px] text-muted-foreground">
              {["", "Tue", "", "Thu", "", "Sat", ""].map((label, i) => (
                <span key={i} className="h-2.5 leading-[10px]">
                  {label}
                </span>
              ))}
            </div>

            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[3px]">
                <span className="h-3 text-[9px] leading-3 text-muted-foreground">
                  {week.monthLabel}
                </span>
                {week.days.map((day, dayIndex) =>
                  day ? (
                    <Tooltip
                      key={day.date}
                      label={describeDay(day, byDate.get(day.date))}
                      delayDuration={80}
                    >
                      <span
                        tabIndex={0}
                        className={cn(
                          "size-2.5 rounded-[3px] transition-transform hover:scale-125 focus-visible:scale-125",
                          levelClass(
                            intensity(byDate.get(day.date)?.events ?? 0, busiest),
                          ),
                        )}
                      />
                    </Tooltip>
                  ) : (
                    // Trailing days after today: keep the column height stable.
                    <span key={`empty-${dayIndex}`} className="size-2.5" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium">Recent activity</h2>

        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="font-display text-2xl tracking-tight">
              Nothing here yet
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Open a page and start writing — your activity shows up here.
            </p>
          </div>
        ) : (
          <div className="space-y-7">
            {grouped.map(({ label, entries }) => (
              <div key={label}>
                <h3 className="mb-2.5 border-b border-border pb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </h3>
                <ol className="space-y-0.5">
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <TimelineRow entry={entry} />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-paper">
      <span
        className={cn(
          "mb-3 grid size-8 place-items-center rounded-lg",
          accent ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-medium tabular-nums tracking-tight">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const time = entry.occurredAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const href = entry.pageId
    ? `/n/${entry.notebookId}/p/${entry.pageId}`
    : entry.notebookId
      ? `/n/${entry.notebookId}`
      : null;

  const body = (
    <span className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted">
      <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
        {time}
      </span>
      <span className="shrink-0 text-sm">{entry.notebookIcon ?? "•"}</span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {ACTIVITY_VERBS[entry.type] ?? "Updated"}{" "}
        <span className="font-medium">
          {entry.pageTitle ?? entry.notebookTitle ?? "a page"}
        </span>
      </span>
      {entry.pageTitle && entry.notebookTitle && (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {entry.notebookTitle}
        </span>
      )}
    </span>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    <span className="block opacity-70">{body}</span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Calendar construction                                                      */
/* -------------------------------------------------------------------------- */

interface CalendarWeek {
  monthLabel: string;
  days: ({ date: string } | null)[];
}

/**
 * Build 53 Monday-anchored columns ending today.
 *
 * Uses local dates throughout — bucketing by UTC would shift a late-night
 * study session into the wrong square for most of the world.
 */
function buildCalendar(todayKey: string): CalendarWeek[] {
  // Derived from the server's date rather than `new Date()`: the server runs
  // UTC and the viewer may be hours away, so computing "today" on both sides
  // produced different calendars and a hydration mismatch.
  const today = new Date(`${todayKey}T00:00:00`);

  // Walk back to the Monday of the current week, then back 52 more weeks.
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  start.setDate(start.getDate() - (WEEKS - 1) * 7);

  const weeks: CalendarWeek[] = [];
  const cursor = new Date(start);
  let lastMonth = -1;

  for (let week = 0; week < WEEKS; week += 1) {
    const days: ({ date: string } | null)[] = [];
    let monthLabel = "";

    for (let day = 0; day < 7; day += 1) {
      if (cursor > today) {
        days.push(null);
      } else {
        days.push({ date: toDateKey(cursor) });
        if (day === 0 && cursor.getMonth() !== lastMonth) {
          lastMonth = cursor.getMonth();
          monthLabel = cursor.toLocaleDateString(undefined, { month: "short" });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push({ monthLabel, days });
  }

  return weeks;
}

function intensity(events: number, busiest: number): number {
  if (events <= 0) return 0;
  const ratio = events / busiest;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

function levelClass(level: number) {
  switch (level) {
    case 4:
      return "bg-accent";
    case 3:
      return "bg-accent/70";
    case 2:
      return "bg-accent/45";
    case 1:
      return "bg-accent/25";
    default:
      return "bg-muted";
  }
}

function describeDay(day: { date: string }, activity?: DayActivity) {
  const label = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (!activity || (activity.events === 0 && activity.seconds === 0)) {
    return `${label} — no activity`;
  }

  const parts = [pluralize(activity.events, "edit")];
  if (activity.seconds > 0) parts.push(formatDuration(activity.seconds));
  return `${label} — ${parts.join(" · ")}`;
}

function groupByDay(entries: TimelineEntry[], todayKey: string) {
  const groups = new Map<string, TimelineEntry[]>();

  for (const entry of entries) {
    const key = toDateKey(new Date(entry.occurredAt));
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  const yesterdayDate = new Date(`${todayKey}T00:00:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toDateKey(yesterdayDate);

  return [...groups.entries()].map(([key, dayEntries]) => ({
    label:
      key === todayKey
        ? "Today"
        : key === yesterday
          ? "Yesterday"
          : new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            }),
    entries: dayEntries,
  }));
}

const ACTIVITY_VERBS: Partial<Record<ActivityType, string>> = {
  "notebook.created": "Created notebook",
  "notebook.renamed": "Renamed notebook",
  "notebook.deleted": "Deleted notebook",
  "notebook.opened": "Opened",
  "page.created": "Created",
  "page.edited": "Edited",
  "page.renamed": "Renamed",
  "page.deleted": "Deleted",
  "page.duplicated": "Duplicated",
  "image.added": "Added an image to",
};
