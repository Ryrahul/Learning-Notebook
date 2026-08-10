import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import {
  getDailyActivity,
  getStudyStats,
  getTimeline,
} from "@/lib/services/activity";
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
      daily={daily}
      stats={stats}
      timeline={timeline.map((entry) => ({
        id: entry.id,
        type: entry.type,
        occurredAt: entry.occurredAt,
        notebookId: entry.notebookId,
        pageId: entry.pageId,
        notebookTitle: entry.notebookTitle,
        pageTitle: entry.pageTitle,
        notebookIcon: entry.notebookIcon,
      }))}
    />
  );
}
