export type DailyTaskRotationSlot = 'catch' | 'explore' | 'leaderboard' | 'social' | 'special';
export type DailyTaskRotationDifficulty = 'easy' | 'medium' | 'hard' | 'special';

export type DailyTaskRotationMetadata = {
  eligible: boolean;
  slot: DailyTaskRotationSlot;
  difficulty: DailyTaskRotationDifficulty;
  family: string;
};

export type DailyTaskLevelingMetadata = {
  xp: number | null;
};

const DEFAULT_SLOT: DailyTaskRotationSlot = 'catch';
const DEFAULT_DIFFICULTY: DailyTaskRotationDifficulty = 'medium';
const DEFAULT_FAMILY = 'general';

export function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function rotationRecord(metadata: unknown): Record<string, unknown> {
  return metadataRecord(metadataRecord(metadata).rotation);
}

function levelingRecord(metadata: unknown): Record<string, unknown> {
  return metadataRecord(metadataRecord(metadata).leveling);
}

function normalizeSlot(value: unknown): DailyTaskRotationSlot {
  if (
    value === 'catch' ||
    value === 'explore' ||
    value === 'leaderboard' ||
    value === 'social' ||
    value === 'special'
  ) {
    return value;
  }

  return DEFAULT_SLOT;
}

function normalizeDifficulty(value: unknown): DailyTaskRotationDifficulty {
  if (value === 'easy' || value === 'medium' || value === 'hard' || value === 'special') {
    return value;
  }

  return DEFAULT_DIFFICULTY;
}

function normalizeFamily(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_FAMILY;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_FAMILY;
}

export function normalizeDailyTaskRotationMetadata(metadata: unknown): DailyTaskRotationMetadata {
  const root = metadataRecord(metadata);
  const rotation = rotationRecord(metadata);
  const slot = normalizeSlot(rotation.slot);
  const difficulty = normalizeDifficulty(rotation.difficulty);
  const legacySpecialPool = root.rotationPool === 'special';
  const legacyEligible = root.defaultRotationEligible !== false && !legacySpecialPool;
  const explicitEligible =
    typeof rotation.eligible === 'boolean' ? rotation.eligible : legacyEligible;

  return {
    eligible: explicitEligible && slot !== 'special' && difficulty !== 'special',
    slot,
    difficulty,
    family: normalizeFamily(rotation.family),
  };
}

export function normalizeDailyTaskLevelingMetadata(metadata: unknown): DailyTaskLevelingMetadata {
  const leveling = levelingRecord(metadata);
  const xpRaw = leveling.xp;

  if (typeof xpRaw !== 'number' || !Number.isFinite(xpRaw)) {
    return { xp: null };
  }

  const xp = Math.trunc(xpRaw);
  return xp > 0 && xp <= 500 ? { xp } : { xp: null };
}

export function isDefaultRotationEligible(metadata: unknown): boolean {
  return normalizeDailyTaskRotationMetadata(metadata).eligible;
}
