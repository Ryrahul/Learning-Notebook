"use client";

import * as React from "react";

/**
 * Study-session heartbeat.
 *
 * Fires only while the tab is visible *and* the user has interacted recently.
 * Both conditions matter: the first stops background tabs from counting, the
 * second stops a page you walked away from counting. Together they make
 * "hours studied" measure attention rather than uptime.
 */

const HEARTBEAT_MS = 60_000;
/** No interaction for this long and we stop counting. */
const IDLE_AFTER_MS = 2 * 60_000;

export function useStudySession({
  notebookId,
  pageId,
  enabled = true,
}: {
  notebookId: string | null;
  pageId: string | null;
  enabled?: boolean;
}) {
  const lastInteractionRef = React.useRef(0);

  React.useEffect(() => {
    if (!enabled) return;
    // Opening the page counts as interaction.
    lastInteractionRef.current = Date.now();

    const noteInteraction = () => {
      lastInteractionRef.current = Date.now();
    };

    const events = ["pointerdown", "keydown", "wheel", "pointermove"] as const;
    for (const event of events) {
      window.addEventListener(event, noteInteraction, { passive: true });
    }

    async function ping() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteractionRef.current > IDLE_AFTER_MS) return;

      try {
        await fetch("/api/activity/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notebookId, pageId }),
        });
      } catch {
        // Progress tracking is strictly secondary; a dropped ping is fine.
      }
    }

    // Open the session immediately so short visits still register.
    void ping();
    const timer = setInterval(() => void ping(), HEARTBEAT_MS);

    return () => {
      clearInterval(timer);
      for (const event of events) {
        window.removeEventListener(event, noteInteraction);
      }
    };
  }, [enabled, notebookId, pageId]);
}
