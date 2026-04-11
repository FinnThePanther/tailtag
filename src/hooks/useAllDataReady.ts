import type { UseQueryResult } from '@tanstack/react-query';

type ReadyCheckable = Pick<UseQueryResult, 'data' | 'isError'>;

/**
 * Returns true once every query in the list has either resolved with data
 * or settled into an error state. Using `data !== undefined || isError`
 * (rather than `!isPending`) means:
 *
 * - Cached revisits render content immediately — no skeleton flash.
 * - Background refetches keep stale data on screen — no mid-session flash.
 * - Error states count as ready so the consuming component can show its
 *   own error UI.
 */
export function useAllDataReady(queries: readonly ReadyCheckable[]): boolean {
  return queries.every((q) => q.data !== undefined || q.isError);
}
