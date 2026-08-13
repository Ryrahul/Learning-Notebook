import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import {
  getDailyActivity,
  getStudyStats,
  getTimeline,
} from "@/lib/services/activity";
import { toDateKey } from "@/lib/utils";
import { ActivityDashboard } from "../_components/activity-dashboard";

export const metadata: Metadata = { title: "Study progress" };

export default async function ActivityPage() {
  const user = await requireUser();

  const [daily, stats, timeline] = await Promise.all([
    getDailyActivity(user.id, 364),
    getStudyStats(user.id),
    getTimeline(user.id, { limit: 80 }),
  ]);

  return (
    <ActivityDashboard
      // Anchored server-side so SSR and hydration agree, and so the calendar
      // lines up with how getDailyActivity buckets rows.
      todayKey={toDateKey(new Date())}
      daily={daily}
      stats={stats}
      timeline={timeline.map((entry) => ({
        id: entry.id,
        type: entry.type,
        occurredAt: entry.occurredAt,
        // Bucketed here so the server and the browser group entries the same
        // way. Deriving it on both sides put an entry at 20:30 UTC on
        // different days either side of the date line and produced a different
        // number of rows after hydration.
        dayKey: toDateKey(entry.occurredAt),
        notebookId: entry.notebookId,
        pageId: entry.pageId,
        notebookTitle: entry.notebookTitle,
        pageTitle: entry.pageTitle,
        notebookIcon: entry.notebookIcon,
      }))}
    />
  );
}
