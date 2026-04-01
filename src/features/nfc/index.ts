// Types
export type {
  NfcSupportStatus,
  NfcScanState,
  NfcScanResult,
  NfcScanError,
  NfcScanErrorCode,
  EmitNfcScanParams,
  EmitNfcScanResult,
  // Tag types
  NfcTagStatus,
  NfcTag,
  TagCheckResult,
  TagRegistrationResult,
  TagRegistrationError,
  TagRegistrationErrorCode,
  TagLookupResult,
  TagLookupFailReason,
} from './types';

// Hooks
export { useNfcScanner } from './hooks/useNfcScanner';
export { useTagRegistration } from './hooks/useTagRegistration';
export type { RegistrationStep, RegistrationState } from './hooks/useTagRegistration';

// Components
export { NfcScanCard } from './components/NfcScanCard';
export { TagStatusBadge } from './components/TagStatusBadge';
export { FursuitTagSection } from './components/FursuitTagSection';
export { TagRegistrationFlow } from './components/TagRegistrationFlow';

// API
export { emitNfcScan } from './api/nfc';
export {
  NFC_TAG_QUERY_KEY,
  nfcTagQueryKey,
  checkTagStatus,
  registerTag,
  linkTagToFursuit,
  linkTagByIdToFursuit,
  unlinkTag,
  markTagLost,
  markTagFound,
  fetchFursuitTag,
  lookupTagForCatch,
} from './api/nfcTags';
