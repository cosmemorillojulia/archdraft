import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function that keeps its identity across renders and always calls the
 * latest `handler`. React Flow copies each handler prop into its store when
 * the prop changes, and every store change runs the selectors of every node
 * and edge; with inline handlers that happened at each step of a drag.
 */
export function useStableHandler<A extends unknown[], R>(
  handler: (...args: A) => R,
): (...args: A) => R {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
