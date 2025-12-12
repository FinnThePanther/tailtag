export type NfcSupportStatus =
  | 'checking'
  | 'supported'
  | 'unsupported'
  | 'disabled';

export type NfcScanState = 'idle' | 'scanning' | 'success' | 'error';

export type NfcScanResult = {
  tagUid: string; // Hex-normalized UID (uppercase)
  rawId: string; // Raw ID string from tag
  techTypes: string[]; // Available technologies
  scannedAt: string; // ISO timestamp
};

export type NfcScanErrorCode =
  | 'NFC_UNSUPPORTED'
  | 'NFC_DISABLED'
  | 'SCAN_CANCELLED'
  | 'SCAN_FAILED'
  | 'UNKNOWN';

export type NfcScanError = {
  code: NfcScanErrorCode;
  message: string;
};

export type EmitNfcScanParams = {
  tagUid: string;
  conventionId: string;
};

export type EmitNfcScanResult = {
  eventId: string;
  tagUid: string;
};

// ============================================
// NFC Tag Registration Types
// ============================================

export type NfcTagStatus = 'pending_link' | 'active' | 'lost' | 'revoked';

export type NfcTag = {
  uid: string;
  fursuitId: string | null;
  registeredByUserId: string;
  status: NfcTagStatus;
  registeredAt: string;
  linkedAt: string | null;
  updatedAt: string;
};

export type TagCheckResult = {
  exists: boolean;
  status?: NfcTagStatus;
  fursuitId?: string | null;
  isMine?: boolean;
};

export type TagRegistrationResult = {
  success: boolean;
  tagUid: string;
  status: NfcTagStatus;
  fursuitId?: string | null;
};

export type TagLookupResult =
  | { found: true; fursuitId: string }
  | { found: false; reason: TagLookupFailReason };

export type TagLookupFailReason =
  | 'TAG_NOT_REGISTERED'
  | 'TAG_NOT_LINKED'
  | 'TAG_LOST'
  | 'TAG_REVOKED';

export type TagRegistrationErrorCode =
  | 'TAG_ALREADY_REGISTERED'
  | 'TAG_BELONGS_TO_ANOTHER_USER'
  | 'TAG_NOT_FOUND'
  | 'NOT_TAG_OWNER'
  | 'FURSUIT_NOT_OWNED'
  | 'FURSUIT_ALREADY_HAS_TAG'
  | 'INVALID_TAG_STATUS'
  | 'INVALID_REQUEST'
  | 'QR_ALREADY_EXISTS'
  | 'QR_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export type TagRegistrationError = {
  code: TagRegistrationErrorCode;
  message: string;
};
