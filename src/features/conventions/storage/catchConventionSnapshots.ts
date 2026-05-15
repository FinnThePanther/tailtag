import AsyncStorage from '@react-native-async-storage/async-storage';

import { addMonitoringBreadcrumb, captureHandledException } from '@/lib/sentry';
import type { ConventionSuitRosterEntry } from '../api/conventions';

const STORAGE_VERSION = 1;
const SNAPSHOT_TTL_MS = 72 * 60 * 60 * 1000;

const contextKeyForUser = (userId: string) =>
  `tailtag:catch-convention-context:v${STORAGE_VERSION}:${userId}`;

const rosterKeyForConvention = (userId: string, conventionId: string) =>
  `tailtag:catch-convention-roster:v${STORAGE_VERSION}:${userId}:${conventionId}`;

export type CatchConventionContextSnapshot = {
  userId: string;
  activeConventionIds: string[];
  cachedAt: string;
};

export type CatchConventionRosterSnapshotEntry = {
  fursuitId: string;
  conventionId: string;
  name: string;
  species: string | null;
  avatarUrl: string | null;
  ownerProfileId: string | null;
  rosterVisible: boolean;
};

export type CatchConventionRosterSnapshot = {
  userId: string;
  conventionId: string;
  cachedAt: string;
  entries: CatchConventionRosterSnapshotEntry[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFreshIsoDate = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= SNAPSHOT_TTL_MS;
};

const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

function recordSnapshotBreadcrumb(
  message: string,
  data: Record<string, unknown>,
  level: 'info' | 'warning' = 'info',
) {
  addMonitoringBreadcrumb({
    category: 'catch-convention-snapshot',
    message,
    level,
    data,
  });
}

function parseContextSnapshot(
  value: unknown,
  userId: string,
): CatchConventionContextSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.userId !== userId) return null;
  if (typeof value.cachedAt !== 'string' || !isFreshIsoDate(value.cachedAt)) return null;
  if (!Array.isArray(value.activeConventionIds)) return null;

  const activeConventionIds = value.activeConventionIds.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );

  if (activeConventionIds.length === 0) return null;

  return {
    userId,
    activeConventionIds,
    cachedAt: value.cachedAt,
  };
}

function parseRosterEntry(value: unknown): CatchConventionRosterSnapshotEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.fursuitId !== 'string' || value.fursuitId.trim().length === 0) return null;
  if (typeof value.conventionId !== 'string' || value.conventionId.trim().length === 0) {
    return null;
  }
  if (typeof value.name !== 'string' || value.name.trim().length === 0) return null;

  return {
    fursuitId: value.fursuitId,
    conventionId: value.conventionId,
    name: value.name,
    species: asNullableString(value.species),
    avatarUrl: asNullableString(value.avatarUrl),
    ownerProfileId: asNullableString(value.ownerProfileId),
    rosterVisible: value.rosterVisible !== false,
  };
}

function parseRosterSnapshot(
  value: unknown,
  userId: string,
  conventionId: string,
): CatchConventionRosterSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.userId !== userId || value.conventionId !== conventionId) return null;
  if (typeof value.cachedAt !== 'string' || !isFreshIsoDate(value.cachedAt)) return null;
  if (!Array.isArray(value.entries)) return null;

  return {
    userId,
    conventionId,
    cachedAt: value.cachedAt,
    entries: value.entries
      .map(parseRosterEntry)
      .filter((entry): entry is CatchConventionRosterSnapshotEntry => Boolean(entry)),
  };
}

async function loadJsonSnapshot<T>(
  key: string,
  parser: (value: unknown) => T | null,
  context: Record<string, unknown>,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      recordSnapshotBreadcrumb('snapshot miss', context);
      return null;
    }

    const parsed = parser(JSON.parse(raw));
    if (!parsed) {
      recordSnapshotBreadcrumb('snapshot stale or invalid', context, 'warning');
      await AsyncStorage.removeItem(key);
      return null;
    }

    recordSnapshotBreadcrumb('snapshot hit', context);
    return parsed;
  } catch (error) {
    captureHandledException(error, {
      scope: 'catch-convention-snapshot.load',
      additionalContext: context,
    });
    return null;
  }
}

export async function loadCatchConventionContextSnapshot(
  userId: string,
): Promise<CatchConventionContextSnapshot | null> {
  return loadJsonSnapshot(
    contextKeyForUser(userId),
    (value) => parseContextSnapshot(value, userId),
    { userId, snapshotType: 'context' },
  );
}

export async function saveCatchConventionContextSnapshot(params: {
  userId: string;
  activeConventionIds: string[];
}) {
  const uniqueActiveConventionIds = [...new Set(params.activeConventionIds)].filter(Boolean);
  if (uniqueActiveConventionIds.length === 0) return;

  try {
    await AsyncStorage.setItem(
      contextKeyForUser(params.userId),
      JSON.stringify({
        userId: params.userId,
        activeConventionIds: uniqueActiveConventionIds,
        cachedAt: new Date().toISOString(),
      }),
    );
    recordSnapshotBreadcrumb('context snapshot written', {
      userId: params.userId,
      activeConventionCount: uniqueActiveConventionIds.length,
    });
  } catch (error) {
    captureHandledException(error, {
      scope: 'catch-convention-snapshot.saveContext',
      additionalContext: { userId: params.userId },
    });
  }
}

export async function clearCatchConventionContextSnapshot(userId: string) {
  try {
    await AsyncStorage.removeItem(contextKeyForUser(userId));
    recordSnapshotBreadcrumb('context snapshot cleared', { userId });
  } catch (error) {
    captureHandledException(error, {
      scope: 'catch-convention-snapshot.clearContext',
      additionalContext: { userId },
    });
  }
}

export async function loadCatchConventionRosterSnapshots(params: {
  userId: string;
  conventionIds: string[];
}): Promise<CatchConventionRosterSnapshot[]> {
  const snapshots = await Promise.all(
    [...new Set(params.conventionIds)].map((conventionId) =>
      loadJsonSnapshot(
        rosterKeyForConvention(params.userId, conventionId),
        (value) => parseRosterSnapshot(value, params.userId, conventionId),
        { userId: params.userId, conventionId, snapshotType: 'roster' },
      ),
    ),
  );

  return snapshots.filter((snapshot): snapshot is CatchConventionRosterSnapshot =>
    Boolean(snapshot),
  );
}

export async function saveCatchConventionRosterSnapshot(params: {
  userId: string;
  conventionId: string;
  entries: ConventionSuitRosterEntry[];
}) {
  try {
    const snapshot: CatchConventionRosterSnapshot = {
      userId: params.userId,
      conventionId: params.conventionId,
      cachedAt: new Date().toISOString(),
      entries: params.entries.map((entry) => ({
        fursuitId: entry.fursuitId,
        conventionId: entry.conventionId,
        name: entry.name,
        species: entry.species,
        avatarUrl: entry.avatarUrl,
        ownerProfileId: entry.ownerProfileId,
        rosterVisible: entry.rosterVisible !== false,
      })),
    };

    await AsyncStorage.setItem(
      rosterKeyForConvention(params.userId, params.conventionId),
      JSON.stringify(snapshot),
    );
    recordSnapshotBreadcrumb('roster snapshot written', {
      userId: params.userId,
      conventionId: params.conventionId,
      entryCount: snapshot.entries.length,
    });
  } catch (error) {
    captureHandledException(error, {
      scope: 'catch-convention-snapshot.saveRoster',
      additionalContext: {
        userId: params.userId,
        conventionId: params.conventionId,
      },
    });
  }
}

export async function cleanupCatchConventionSnapshots(params: {
  userId: string;
  conventionIds: string[];
}) {
  await Promise.all([
    loadCatchConventionContextSnapshot(params.userId),
    ...params.conventionIds.map((conventionId) =>
      loadJsonSnapshot(
        rosterKeyForConvention(params.userId, conventionId),
        (value) => parseRosterSnapshot(value, params.userId, conventionId),
        { userId: params.userId, conventionId, snapshotType: 'roster-cleanup' },
      ),
    ),
  ]);
}
