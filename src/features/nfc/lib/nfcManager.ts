/**
 * Safe NFC Manager wrapper that handles simulator environments.
 *
 * The react-native-nfc-manager library throws an error when imported on simulators
 * because the native module doesn't exist. This wrapper provides mock implementations
 * for simulator environments.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { NfcTech as NfcTechEnum } from 'react-native-nfc-manager';

// Determine if we should use mock NFC (simulator only)
// We try to load real NFC on any device and let it fail gracefully if unavailable
// Only use mock mode on iOS Simulator or Android Emulator where native modules crash
let isSimulator = false;

// Check using expo-constants
if (Constants.isDevice === false) {
  // Explicitly marked as not a device - likely simulator
  isSimulator = true;
}

// However, Constants.isDevice can be undefined or unreliable in some builds
// So we also check if the native NFC module exists
// If it does, we're on a real device (or an emulator with NFC support, which is fine)
let hasNativeModule = false;
try {
  // Try to require the native module - this will throw on simulators
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nfcModule = require('react-native-nfc-manager');
  hasNativeModule = nfcModule?.default != null;
} catch {
  hasNativeModule = false;
}

// If we have the native module, use real NFC regardless of isDevice value
if (hasNativeModule) {
  isSimulator = false;
}

// Mock NfcTech enum that matches the real library's values
const MockNfcTech = {
  Ndef: 'Ndef',
  NfcA: 'NfcA',
  NfcB: 'NfcB',
  NfcF: 'NfcF',
  NfcV: 'NfcV',
  IsoDep: 'IsoDep',
  MifareClassic: 'MifareClassic',
  MifareUltralight: 'MifareUltralight',
  MifareIOS: 'mifare',
  Iso15693IOS: 'iso15693',
  FelicaIOS: 'felica',
} as unknown as typeof NfcTechEnum;

// Mock NFC Manager for simulators
const MockNfcManager = {
  isSupported: async () => false,
  isEnabled: async () => false,
  start: async () => {},
  cancelTechnologyRequest: async () => {},
  requestTechnology: async (_tech: NfcTechEnum, _options?: object) => {},
  getTag: async () => null,
};

type MockNfcManagerType = typeof MockNfcManager;
type RealNfcManagerType = typeof import('react-native-nfc-manager').default;

// Real NFC Manager (only imported on real devices)
let RealNfcManager: RealNfcManagerType | null = null;
let RealNfcTech: typeof NfcTechEnum | null = null;

// Lazy load the real NFC manager only on real devices
function getRealNfcManager() {
  if (RealNfcManager === null) {
    // This will only be called on real devices
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nfcModule = require('react-native-nfc-manager');
    RealNfcManager = nfcModule.default;
    RealNfcTech = nfcModule.NfcTech;
  }
  return { NfcManager: RealNfcManager!, NfcTech: RealNfcTech! };
}

// Helper to get NfcManager (lazy loads real one if needed)
export function getNfcManager(): MockNfcManagerType | RealNfcManagerType {
  if (isSimulator) {
    return MockNfcManager;
  }
  return getRealNfcManager().NfcManager;
}

// Helper to get NfcTech enum
export function getNfcTech(): typeof NfcTechEnum {
  if (isSimulator) {
    return MockNfcTech;
  }
  return getRealNfcManager().NfcTech;
}

// Export simulator status for use in components
export const isNfcSimulatorMode = isSimulator;

// Log warning in development
if (__DEV__ && isSimulator) {
  console.log(
    `[NFC] Running on ${Platform.OS} simulator - NFC features will be mocked`
  );
}
