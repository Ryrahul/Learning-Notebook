"use client";

import * as React from "react";

/**
 * Re-seed local state when an external value changes.
 *
 * This is React's sanctioned "adjusting state when a prop changes" pattern —
 * a render-phase update — rather than `useEffect(() => setX(prop), [prop])`.
 * The effect version renders once with stale state, then immediately renders
 * again; React re-runs this component before committing, so the DOM only ever
 * sees the correct value.
 *
 * Used wherever a form or list is seeded from server data but then edited
 * locally (page titles, notebook order, search boxes).
 */
export function useSyncedFrom<T>(value: T, apply: (value: T) => void): void {
  const [previous, setPrevious] = React.useState(value);
  if (!Object.is(previous, value)) {
    setPrevious(value);
    apply(value);
  }
}

/**
 * Keep a ref pointing at the latest value without writing to it during render.
 *
 * For callbacks and config that long-lived imperative code (canvas engine
 * events, timers, subscriptions) needs to read, without re-subscribing every
 * time the value changes.
 */
export function useLatestRef<T>(value: T): React.RefObject<T> {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/**
 * `true` only after hydration.
 *
 * `useSyncExternalStore` with a server snapshot of `false` gives us this
 * without a setState-in-effect: React reads the server snapshot during SSR and
 * the client snapshot after hydration.
 */
const emptySubscribe = () => () => {};
export function useMounted(): boolean {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
