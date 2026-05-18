import { fetchPastConventionRecaps } from '@/features/conventions/api/conventions';
import { captureHandledException } from '@/lib/sentry';
import {
  CAUGHT_SUITS_STALE_TIME,
  fetchCaughtSuits,
  type CaughtRecord,
} from '@/features/suits/api/caughtSuits';

export type CaughtConventionFolder = {
  conventionId: string;
  conventionName: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  catchCount: number;
  recapId: string | null;
  catches: CaughtRecord[];
};

export type CaughtSuitAggregate = {
  id: string;
  catchCount: number;
  latestCatch: CaughtRecord;
  catches: CaughtRecord[];
};

export type CaughtCollection = {
  allCatches: CaughtRecord[];
  allCaughtSuits: CaughtSuitAggregate[];
  conventionFolders: CaughtConventionFolder[];
};

export const CAUGHT_COLLECTION_QUERY_KEY = 'caught-collection';

export const caughtCollectionQueryKey = (userId: string) =>
  [CAUGHT_COLLECTION_QUERY_KEY, userId] as const;

const isSupabaseError = (
  error: unknown,
): error is { code?: string; details?: string; hint?: string; message?: string } =>
  typeof error === 'object' &&
  error !== null &&
  ('code' in error || 'details' in error || 'hint' in error);

export async function fetchCaughtCollection(userId: string): Promise<CaughtCollection> {
  const allCatches = await fetchCaughtSuits(userId);
  const recapIdsByConventionId = await fetchRecapIdsByConventionId();

  return {
    allCatches,
    allCaughtSuits: buildCaughtSuitAggregates(allCatches),
    conventionFolders: buildConventionFolders(allCatches, recapIdsByConventionId),
  };
}

async function fetchRecapIdsByConventionId(): Promise<Map<string, string>> {
  try {
    const recaps = await fetchPastConventionRecaps();
    return new Map(recaps.map((recap) => [recap.conventionId, recap.recapId]));
  } catch (error) {
    if (!isSupabaseError(error)) {
      captureHandledException(error, {
        scope: 'fetchRecapIdsByConventionId',
        additionalContext: { function: 'fetchRecapIdsByConventionId' },
      });
    }

    return new Map();
  }
}

function buildConventionFolders(
  allCatches: CaughtRecord[],
  recapIdsByConventionId: Map<string, string>,
): CaughtConventionFolder[] {
  const foldersByConventionId = new Map<string, CaughtConventionFolder>();

  allCatches.forEach((record) => {
    const convention = record.convention;

    if (!record.conventionId || !convention) {
      return;
    }

    const existingFolder = foldersByConventionId.get(record.conventionId);

    if (existingFolder) {
      existingFolder.catches.push(record);
      existingFolder.catchCount = existingFolder.catches.length;
      return;
    }

    foldersByConventionId.set(record.conventionId, {
      conventionId: record.conventionId,
      conventionName: convention.name,
      location: convention.location,
      startDate: convention.startDate,
      endDate: convention.endDate,
      catchCount: 1,
      recapId: recapIdsByConventionId.get(record.conventionId) ?? null,
      catches: [record],
    });
  });

  return Array.from(foldersByConventionId.values()).sort(compareConventionFolders);
}

function compareConventionFolders(
  left: CaughtConventionFolder,
  right: CaughtConventionFolder,
): number {
  const endDateDiff = compareNullableDateDesc(left.endDate, right.endDate);
  if (endDateDiff !== 0) return endDateDiff;

  const recentCatchDiff = compareNullableDateDesc(
    getMostRecentCaughtAt(left.catches),
    getMostRecentCaughtAt(right.catches),
  );
  if (recentCatchDiff !== 0) return recentCatchDiff;

  return left.conventionName.localeCompare(right.conventionName);
}

function buildCaughtSuitAggregates(allCatches: CaughtRecord[]): CaughtSuitAggregate[] {
  const catchesBySuitId = new Map<string, CaughtRecord[]>();

  allCatches.forEach((record) => {
    const suitId = record.fursuit?.id ?? record.id;
    const existing = catchesBySuitId.get(suitId);

    if (existing) {
      existing.push(record);
      return;
    }

    catchesBySuitId.set(suitId, [record]);
  });

  return Array.from(catchesBySuitId.entries())
    .map(([id, catches]) => ({
      id,
      catchCount: catches.length,
      latestCatch: getLatestCatch(catches),
      catches,
    }))
    .sort(compareCaughtSuitAggregates);
}

function getLatestCatch(catches: CaughtRecord[]): CaughtRecord {
  return catches.reduce((latest, record) => {
    if (!record.caught_at) return latest;
    if (!latest.caught_at) return record;

    return new Date(record.caught_at).getTime() > new Date(latest.caught_at).getTime()
      ? record
      : latest;
  }, catches[0]);
}

function compareCaughtSuitAggregates(
  left: CaughtSuitAggregate,
  right: CaughtSuitAggregate,
): number {
  const latestCatchDiff = compareNullableDateDesc(
    left.latestCatch.caught_at,
    right.latestCatch.caught_at,
  );
  if (latestCatchDiff !== 0) return latestCatchDiff;

  const leftName = left.latestCatch.fursuit?.name ?? '';
  const rightName = right.latestCatch.fursuit?.name ?? '';
  return leftName.localeCompare(rightName);
}

function getMostRecentCaughtAt(catches: CaughtRecord[]): string | null {
  return catches.reduce<string | null>((latest, record) => {
    if (!record.caught_at) return latest;
    if (!latest) return record.caught_at;

    return new Date(record.caught_at).getTime() > new Date(latest).getTime()
      ? record.caught_at
      : latest;
  }, null);
}

function compareNullableDateDesc(left: string | null, right: string | null): number {
  if (left && right) {
    return new Date(right).getTime() - new Date(left).getTime();
  }

  if (left) return -1;
  if (right) return 1;
  return 0;
}

export const createCaughtCollectionQueryOptions = (userId: string) => ({
  queryKey: caughtCollectionQueryKey(userId),
  queryFn: () => fetchCaughtCollection(userId),
  staleTime: CAUGHT_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
