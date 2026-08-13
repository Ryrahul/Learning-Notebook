"use client";

import * as React from "react";

import { formatRelativeTime } from "@/lib/utils";

/**
 * A timestamp rendered relative to "now".
 *
 * The server and the browser render at different instants, so the formatted
 * string legitimately differs — the server writes "just now", the client
 * hydrates a second later and computes "3s ago". React reports that as a
 * hydration failure (#418). The gap is invisible locally and obvious over a
 * real network, which is why it only showed up once deployed.
 *
 * `suppressHydrationWarning` tells React this text node is expected to differ;
 * it applies to the node's own text only, so genuine mismatches elsewhere are
 * still reported. The interval keeps "2m ago" honest without a page reload.
 */
export function RelativeTime({
  date,
  className,
  prefix,
}: {
  date: Date | string | number;
  className?: string;
  /** Rendered inside the same node, e.g. "Edited ". */
  prefix?: string;
}) {
  const [, tick] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className={className} suppressHydrationWarning>
      {prefix}
      {formatRelativeTime(date)}
    </span>
  );
}
