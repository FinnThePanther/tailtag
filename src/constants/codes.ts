export const UNIQUE_CODE_LENGTH = 8;
export const UNIQUE_CODE_MIN_LENGTH = 4;
// 'JAX' is a special exception to the minimum length requirement.
export const UNIQUE_CODE_JAX_CARVEOUT = 'JAX';
// Exclude ambiguous code characters so capture codes are easier to read aloud and type.
export const UNIQUE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const UNIQUE_CODE_ATTEMPTS = 8;
export const UNIQUE_INSERT_ATTEMPTS = 3;
