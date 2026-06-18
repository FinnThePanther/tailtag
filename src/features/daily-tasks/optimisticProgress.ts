export interface DailyTaskMetadataFilter {
  path: string;
  equals?: unknown;
  notEquals?: unknown;
  in?: unknown[];
  notIn?: unknown[];
  exists?: boolean;
  notEqualsUserId?: boolean;
  equalsUserId?: boolean;
}

export interface DailyTaskMetadata {
  eventType: string;
  metric: 'total' | 'unique';
  uniqueBy?: string;
  filters: DailyTaskMetadataFilter[];
}

interface OptimisticDailyTaskProgressInput {
  metadata: unknown;
  eventType: string;
  eventPayload: Record<string, unknown>;
  userId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getValueAtPath(root: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, root);
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function candidateIsInFilter(candidate: unknown, filterValues: unknown[]) {
  if (Array.isArray(candidate)) {
    return candidate.some((value) => filterValues.includes(value));
  }

  return filterValues.includes(candidate);
}

export function normalizeDailyTaskMetadata(raw: unknown): DailyTaskMetadata | null {
  if (!isRecord(raw)) {
    return null;
  }

  const eventType =
    typeof raw.eventType === 'string'
      ? raw.eventType
      : typeof raw.event_type === 'string'
        ? raw.event_type
        : typeof raw.trigger === 'string'
          ? raw.trigger
          : null;

  if (!eventType) {
    return null;
  }

  return {
    eventType,
    metric: raw.metric === 'unique' ? 'unique' : 'total',
    uniqueBy:
      typeof raw.uniqueBy === 'string'
        ? raw.uniqueBy
        : typeof raw.unique_by === 'string'
          ? raw.unique_by
          : undefined,
    filters: Array.isArray(raw.filters)
      ? raw.filters.filter(
          (entry): entry is DailyTaskMetadataFilter =>
            isRecord(entry) && typeof entry.path === 'string',
        )
      : [],
  };
}

export function matchesDailyTaskMetadataFilters(
  metadata: DailyTaskMetadata,
  eventPayload: Record<string, unknown>,
  userId: string,
) {
  return metadata.filters.every((filter) => {
    const candidate = getValueAtPath(eventPayload, filter.path);

    if (hasOwn(filter, 'equals') && candidate !== filter.equals) {
      return false;
    }

    if (hasOwn(filter, 'notEquals') && candidate === filter.notEquals) {
      return false;
    }

    if (Array.isArray(filter.in) && !candidateIsInFilter(candidate, filter.in)) {
      return false;
    }

    if (Array.isArray(filter.notIn) && candidateIsInFilter(candidate, filter.notIn)) {
      return false;
    }

    if (filter.exists === true && candidate === undefined) {
      return false;
    }

    if (filter.exists === false && candidate !== undefined) {
      return false;
    }

    if (filter.notEqualsUserId === true && candidate === userId) {
      return false;
    }

    if (filter.equalsUserId === true && candidate !== userId) {
      return false;
    }

    return true;
  });
}

export function canOptimisticallyIncrementDailyTask({
  metadata: metadataRaw,
  eventType,
  eventPayload,
  userId,
}: OptimisticDailyTaskProgressInput) {
  const metadata = normalizeDailyTaskMetadata(metadataRaw);

  if (!metadata || metadata.eventType !== eventType || metadata.metric !== 'total') {
    return false;
  }

  if (eventType === 'catch_performed') {
    const status = eventPayload.status;
    if (typeof status !== 'string' || status.toUpperCase() !== 'ACCEPTED') {
      return false;
    }
  }

  return matchesDailyTaskMetadataFilters(metadata, eventPayload, userId);
}
