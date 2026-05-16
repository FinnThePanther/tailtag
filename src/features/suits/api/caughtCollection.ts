import { fetchPastConventionRecaps } from '@/features/conventions/api/conventions';
import { captureHandledException } from '@/lib/sentry';
import {
  CAUGHT_SUITS_STALE_TIME,
  fetchCaughtSuits,
  type CaughtRecord,
  type CaughtRecordConvention,
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

export type CaughtCollection = {
  allCatches: CaughtRecord[];
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

    if (!record.conventionId || !isArchivedConvention(convention)) {
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

function isArchivedConvention(
  convention: CaughtRecordConvention | null,
): convention is CaughtRecordConvention {
  return convention?.status === 'archived';
}

function compareConventionFolders(
  left: CaughtConventionFolder,
  right: CaughtConventionFolder,
): number {
  const endDateDiff = compareNullableDateDesc(left.endDate, right.endDate);
  if (endDateDiff !== 0) return endDateDiff;

  const recentCatchDiff = compareNullableDateDesc(
    left.catches[0]?.caught_at ?? null,
    right.catches[0]?.caught_at ?? null,
  );
  if (recentCatchDiff !== 0) return recentCatchDiff;

  return left.conventionName.localeCompare(right.conventionName);
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
