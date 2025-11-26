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

// Check if running on simulator/emulator
const isSimulator = !Constants.isDevice;

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
