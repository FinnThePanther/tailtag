export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 15;
export const USERNAME_RESERVED_SUBSTRINGS = ['tailtag', 'admin'] as const;

const USERNAME_INVALID_CHARACTERS_REGEX = /[^a-z0-9_]/g;
const USERNAME_ALLOWED_PATTERN = /^[a-z0-9_]+$/;
const GENERATED_SUFFIX_LENGTH = 4;
const GENERATED_SEPARATOR = '_';
const DEFAULT_GENERATED_USERNAME_BASE = 'player';

export type UsernameValidationCode =
  | 'valid'
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'reserved';

export type UsernameValidationResult = {
  isValid: boolean;
  code: UsernameValidationCode;
  message: string | null;
  normalized: string;
};

type ValidateUsernameOptions = {
  allowEmpty?: boolean;
};

function stripReservedSubstrings(value: string): string {
  return USERNAME_RESERVED_SUBSTRINGS.reduce(
    (current, term) => current.split(term).join(''),
    value,
  );
}

function generateRandomSuffix(length: number): string {
  let generated = '';

  while (generated.length < length) {
    generated += Math.random().toString(36).slice(2);
  }

  return generated.slice(0, length);
}

function normalizeGeneratedBase(value: string): string {
  const withoutReserved = stripReservedSubstrings(value);
  const clamped = withoutReserved.slice(0, USERNAME_MAX_LENGTH);
  const fallback =
    clamped.length >= USERNAME_MIN_LENGTH ? clamped : DEFAULT_GENERATED_USERNAME_BASE;
  return fallback.slice(0, USERNAME_MAX_LENGTH);
}

export function normalizeUsernameInput(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(USERNAME_INVALID_CHARACTERS_REGEX, '');
}

export function hasReservedUsernameSubstring(value: string): boolean {
  const lowered = value.toLowerCase();
  return USERNAME_RESERVED_SUBSTRINGS.some((term) => lowered.includes(term));
}

export function validateUsername(
  value: string | null | undefined,
  options: ValidateUsernameOptions = {},
): UsernameValidationResult {
  const allowEmpty = options.allowEmpty === true;
  const normalized = (value ?? '').trim().toLowerCase();

  if (!normalized) {
    if (allowEmpty) {
      return {
        isValid: true,
        code: 'valid',
        message: null,
        normalized,
      };
    }

    return {
      isValid: false,
      code: 'empty',
      message: `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters.`,
      normalized,
    };
  }

  if (normalized.length < USERNAME_MIN_LENGTH) {
    return {
      isValid: false,
      code: 'too_short',
      message: `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
      normalized,
    };
  }

  if (normalized.length > USERNAME_MAX_LENGTH) {
    return {
      isValid: false,
      code: 'too_long',
      message: `Username must be at most ${USERNAME_MAX_LENGTH} characters.`,
      normalized,
    };
  }

  if (!USERNAME_ALLOWED_PATTERN.test(normalized)) {
    return {
      isValid: false,
      code: 'invalid_chars',
      message: 'Use only letters, numbers, and underscores.',
      normalized,
    };
  }

  if (hasReservedUsernameSubstring(normalized)) {
    return {
      isValid: false,
      code: 'reserved',
      message: 'Username cannot include "tailtag" or "admin".',
      normalized,
    };
  }

  return {
    isValid: true,
    code: 'valid',
    message: null,
    normalized,
  };
}

export function toValidUsernameOrNull(value: string | null | undefined): string | null {
  const normalized = normalizeUsernameInput(value);
  const validation = validateUsername(normalized);
  return validation.isValid ? normalized : null;
}

export function buildGeneratedUsername(
  seed: string | null | undefined,
  options: { forceSuffix?: boolean } = {},
): string {
  const forceSuffix = options.forceSuffix === true;
  const normalizedSeed = normalizeUsernameInput(seed);
  const base = normalizeGeneratedBase(normalizedSeed);

  if (!forceSuffix) {
    const baseValidation = validateUsername(base);
    if (baseValidation.isValid) {
      return baseValidation.normalized;
    }
  }

  const prefixLength = USERNAME_MAX_LENGTH - GENERATED_SUFFIX_LENGTH - GENERATED_SEPARATOR.length;
  const prefix = base.slice(0, Math.max(prefixLength, USERNAME_MIN_LENGTH));

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = generateRandomSuffix(GENERATED_SUFFIX_LENGTH);
    const candidate = `${prefix}${GENERATED_SEPARATOR}${suffix}`;
    const validation = validateUsername(candidate);
    if (validation.isValid) {
      return validation.normalized;
    }
  }

  return `${DEFAULT_GENERATED_USERNAME_BASE}${GENERATED_SEPARATOR}${generateRandomSuffix(GENERATED_SUFFIX_LENGTH)}`;
}
