import * as Crypto from 'expo-crypto';

import { UNIQUE_CODE_ALPHABET, UNIQUE_CODE_LENGTH } from '../constants/codes';

export const generateUniqueCodeCandidate = () => {
  const bytes = new Uint8Array(UNIQUE_CODE_LENGTH);
  Crypto.getRandomValues(bytes);

  let code = '';

  for (let iteration = 0; iteration < bytes.length; iteration += 1) {
    const randomIndex = bytes[iteration] % UNIQUE_CODE_ALPHABET.length;
    code += UNIQUE_CODE_ALPHABET.charAt(randomIndex);
  }

  return code;
};

export const normalizeUniqueCodeInput = (value: string) =>
  value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, UNIQUE_CODE_LENGTH);
