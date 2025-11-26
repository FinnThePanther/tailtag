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
