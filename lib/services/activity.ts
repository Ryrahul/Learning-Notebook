import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  activityEvent,
  notebook,
  page,
  studySession,
  type ActivityType,
} from "@/lib/db/schema";
import { toDateKey } from "@/lib/utils";

/** A heartbeat older than this starts a new session rather than extending. */
const SESSION_STALE_AFTER_SECONDS = 5 * 60;

/* -------------------------------------------------------------------------- */
/*  Writing                                                                    */
/* -------------------------------------------------------------------------- */

export interface RecordActivityInput {
  userId: string;
  type: ActivityType;
  notebookId?: string | null;
  pageId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append an activity event.
 *
 * Never allowed to break the action that triggered it — losing a timeline row
 * is an acceptable failure, losing the user's edit is not.
 */
export async function recordActivity(input: RecordActivityInput) {
  try {
    await db.insert(activityEvent).values({
      userId: input.userId,
      type: input.type,
      notebookId: input.notebookId ?? null,
      pageId: input.pageId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("[activity] failed to record", input.type, error);
  }
}

/**
 * Collapse repeated edits of the same page into one event per window.
 *
 * Without this, a 20-minute drawing session writes an event on every autosave
 * and the timeline becomes unreadable.
 */
const EDIT_COALESCE_MINUTES = 10;

export async function recordPageEdit(params: {
  userId: string;
  notebookId: string;
  pageId: string;
  pageTitle: string;
  notebookTitle: string;
}) {
  try {
    const since = new Date(Date.now() - EDIT_COALESCE_MINUTES * 60_000);
    const recent = await db
      .select({ id: activityEvent.id })
      .from(activityEvent)
      .where(
        and(
          eq(activityEvent.userId, params.userId),
          eq(activityEvent.pageId, params.pageId),
          eq(activityEvent.type, "page.edited"),
          gte(activityEvent.occurredAt, since),
        ),
      )
      .limit(1);

    if (recent.length > 0) {
      await db
        .update(activityEvent)
        .set({ occurredAt: new Date() })
        .where(eq(activityEvent.id, recent[0].id));
      return;
    }

    await recordActivity({
      userId: params.userId,
      type: "page.edited",
      notebookId: params.notebookId,
      pageId: params.pageId,
      metadata: {
        pageTitle: params.pageTitle,
        notebookTitle: params.notebookTitle,
      },
    });
  } catch (error) {
    console.error("[activity] failed to record page edit", error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Study sessions                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Extend the user's live study session, or open a new one.
 *
 * Duration is measured from heartbeats rather than from "page open to page
 * close", so leaving a tab open overnight doesn't count as ten hours of study.
 */
export async function heartbeat(params: {
  userId: string;
  notebookId?: string | null;
  pageId?: string | null;
}) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - SESSION_STALE_AFTER_SECONDS * 1000);

  const [live] = await db
    .select()
    .from(studySession)
    .where(
      and(
        eq(studySession.userId, params.userId),
        gte(studySession.lastHeartbeatAt, staleBefore),
      ),
    )
    .orderBy(desc(studySession.lastHeartbeatAt))
    .limit(1);

  if (live) {
    const elapsed = Math.round(
      (now.getTime() - live.lastHeartbeatAt.getTime()) / 1000,
    );
    await db
      .update(studySession)
      .set({
        lastHeartbeatAt: now,
        durationSeconds: live.durationSeconds + Math.max(0, elapsed),
        notebookId: params.notebookId ?? live.notebookId,
        pageId: params.pageId ?? live.pageId,
      })
      .where(eq(studySession.id, live.id));
    return { sessionId: live.id, resumed: true };
  }

  const [created] = await db
    .insert(studySession)
    .values({
      userId: params.userId,
      notebookId: params.notebookId ?? null,
      pageId: params.pageId ?? null,
      startedAt: now,
      lastHeartbeatAt: now,
      durationSeconds: 0,
    })
    .returning({ id: studySession.id });

  return { sessionId: created.id, resumed: false };
}

/* -------------------------------------------------------------------------- */
/*  Reading                                                                    */
/* -------------------------------------------------------------------------- */

export interface TimelineEntry {
  id: string;
  type: ActivityType;
  occurredAt: Date;
  notebookId: string | null;
  pageId: string | null;
  notebookTitle: string | null;
  pageTitle: string | null;
  notebookIcon: string | null;
}

export async function getTimeline(
  userId: string,
  options: { limit?: number; notebookId?: string; since?: Date } = {},
): Promise<TimelineEntry[]> {
  const { limit = 60, notebookId, since } = options;

  const rows = await db
    .select({
      id: activityEvent.id,
      type: activityEvent.type,
      occurredAt: activityEvent.occurredAt,
      notebookId: activityEvent.notebookId,
      pageId: activityEvent.pageId,
      metadata: activityEvent.metadata,
      // Prefer the live title, fall back to what was denormalised at write
      // time so deleted notebooks still read sensibly in history.
      liveNotebookTitle: notebook.title,
      liveNotebookIcon: notebook.icon,
      livePageTitle: page.title,
    })
    .from(activityEvent)
    .leftJoin(notebook, eq(activityEvent.notebookId, notebook.id))
    .leftJoin(page, eq(activityEvent.pageId, page.id))
    .where(
      and(
        eq(activityEvent.userId, userId),
        notebookId ? eq(activityEvent.notebookId, notebookId) : undefined,
        since ? gte(activityEvent.occurredAt, since) : undefined,
      ),
    )
    .orderBy(desc(activityEvent.occurredAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    occurredAt: row.occurredAt,
    notebookId: row.notebookId,
    pageId: row.pageId,
    notebookTitle:
      row.liveNotebookTitle ??
      (row.metadata?.notebookTitle as string | undefined) ??
      null,
    pageTitle:
      row.livePageTitle ?? (row.metadata?.pageTitle as string | undefined) ?? null,
    notebookIcon: row.liveNotebookIcon ?? null,
  }));
}

export interface DayActivity {
  date: string;
  events: number;
  seconds: number;
}

/**
 * Per-day rollup for the heatmap.
 *
 * Grouped in Postgres rather than in JS: a year of activity is tens of
 * thousands of rows, and shipping them all to the server component to reduce
 * would be wasteful.
 */
export async function getDailyActivity(
  userId: string,
  days = 365,
): Promise<DayActivity[]> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - days);

  const [eventRows, sessionRows] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(${activityEvent.occurredAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(activityEvent)
      .where(
        and(
          eq(activityEvent.userId, userId),
          gte(activityEvent.occurredAt, since),
        ),
      )
      .groupBy(sql`1`),
    db
      .select({
        day: sql<string>`to_char(${studySession.startedAt}, 'YYYY-MM-DD')`,
        seconds: sql<number>`coalesce(sum(${studySession.durationSeconds}), 0)::int`,
      })
      .from(studySession)
      .where(
        and(eq(studySession.userId, userId), gte(studySession.startedAt, since)),
      )
      .groupBy(sql`1`),
  ]);

  const byDay = new Map<string, DayActivity>();
  for (const row of eventRows) {
    byDay.set(row.day, { date: row.day, events: row.count, seconds: 0 });
  }
  for (const row of sessionRows) {
    const existing = byDay.get(row.day);
    if (existing) existing.seconds = row.seconds;
    else byDay.set(row.day, { date: row.day, events: 0, seconds: row.seconds });
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface StudyStats {
  currentStreak: number;
  longestStreak: number;
  totalSeconds: number;
  secondsThisWeek: number;
  sessionsThisWeek: number;
  pagesCreatedThisWeek: number;
  activeDaysThisWeek: number;
}

export async function getStudyStats(userId: string): Promise<StudyStats> {
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  // Monday-anchored week.
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

  const [daily, totals, weekly, pagesThisWeek] = await Promise.all([
    getDailyActivity(userId, 400),
    db
      .select({
        seconds: sql<number>`coalesce(sum(${studySession.durationSeconds}), 0)::int`,
      })
      .from(studySession)
      .where(eq(studySession.userId, userId)),
    db
      .select({
        seconds: sql<number>`coalesce(sum(${studySession.durationSeconds}), 0)::int`,
        sessions: sql<number>`count(*)::int`,
      })
      .from(studySession)
      .where(
        and(
          eq(studySession.userId, userId),
          gte(studySession.startedAt, weekStart),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvent)
      .where(
        and(
          eq(activityEvent.userId, userId),
          eq(activityEvent.type, "page.created"),
          gte(activityEvent.occurredAt, weekStart),
        ),
      ),
  ]);

  const activeDays = new Set(
    daily.filter((d) => d.events > 0 || d.seconds > 0).map((d) => d.date),
  );

  return {
    ...computeStreaks(activeDays),
    totalSeconds: totals[0]?.seconds ?? 0,
    secondsThisWeek: weekly[0]?.seconds ?? 0,
    sessionsThisWeek: weekly[0]?.sessions ?? 0,
    pagesCreatedThisWeek: pagesThisWeek[0]?.count ?? 0,
    activeDaysThisWeek: daily.filter(
      (d) => new Date(d.date) >= weekStart && (d.events > 0 || d.seconds > 0),
    ).length,
  };
}

/**
 * Current and longest run of consecutive active days.
 *
 * "Current" tolerates today being empty — a streak shouldn't look broken at
 * 9am just because you haven't studied yet.
 */
function computeStreaks(activeDays: Set<string>): {
  currentStreak: number;
  longestStreak: number;
} {
  if (activeDays.size === 0) return { currentStreak: 0, longestStreak: 0 };

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  if (!activeDays.has(toDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!activeDays.has(toDateKey(cursor))) {
      return { currentStreak: 0, longestStreak: longestRun(activeDays) };
    }
  }

  let currentStreak = 0;
  while (activeDays.has(toDateKey(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, longestRun(activeDays)),
  };
}

function longestRun(activeDays: Set<string>): number {
  const sorted = [...activeDays].sort();
  let longest = 0;
  let run = 0;
  let previous: Date | null = null;

  for (const key of sorted) {
    const day = new Date(`${key}T00:00:00`);
    if (
      previous &&
      Math.round((day.getTime() - previous.getTime()) / 86_400_000) === 1
    ) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    previous = day;
  }

  return longest;
}
