import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getNfcManager,
  getNfcTech,
  isNfcSimulatorMode,
} from '../lib/nfcManager';
import {
  captureHandledException,
  addMonitoringBreadcrumb,
} from '@/lib/sentry';
import type {
  NfcSupportStatus,
  NfcScanState,
  NfcScanResult,
  NfcScanError,
} from '../types';

/**
 * Normalize tag ID to uppercase hex string.
 * The library returns the ID as a hex string already.
 */
function normalizeTagUid(id: string | undefined): string {
  if (!id || id.length === 0) return '';
  return id.toUpperCase();
}

export function useNfcScanner() {
  const [supportStatus, setSupportStatus] =
    useState<NfcSupportStatus>('checking');
  const [scanState, setScanState] = useState<NfcScanState>('idle');
  const [lastScan, setLastScan] = useState<NfcScanResult | null>(null);
  const [error, setError] = useState<NfcScanError | null>(null);
  const isCleanedUp = useRef(false);

  // Check NFC support on mount
  useEffect(() => {
    let mounted = true;

    async function checkNfcSupport() {
      // During testing, allow NFC on all devices
      if (mounted) {
        setSupportStatus('supported');
      }
      return;
    }

    checkNfcSupport();

    return () => {
      mounted = false;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isCleanedUp.current = true;
      if (!isNfcSimulatorMode) {
        getNfcManager().cancelTechnologyRequest().catch(() => {});
      }
    };
  }, []);

  const startScan = useCallback(async (): Promise<NfcScanResult | null> => {
    if (supportStatus !== 'supported') {
      setError({
        code: supportStatus === 'disabled' ? 'NFC_DISABLED' : 'NFC_UNSUPPORTED',
        message:
          supportStatus === 'disabled'
            ? 'NFC is disabled. Please enable it in your device settings.'
            : 'This device does not support NFC.',
      });
      return null;
    }

    setError(null);
    setScanState('scanning');
    setLastScan(null);

    addMonitoringBreadcrumb({
      category: 'nfc',
      message: 'Starting NFC scan',
    });

    const NfcManager = getNfcManager();
    const NfcTech = getNfcTech();

    try {
      // Request NFC technology - NfcA covers most tags (including NTAG)
      await NfcManager.requestTechnology(NfcTech.NfcA, {
        alertMessage: 'Hold your device near the TailTag',
      });

      const tag = await NfcManager.getTag();

      if (isCleanedUp.current) return null;

      if (!tag || !tag.id) {
        throw new Error('No tag ID found');
      }

      const tagUid = normalizeTagUid(tag.id);
      const result: NfcScanResult = {
        tagUid,
        rawId: tag.id,
        techTypes: tag.techTypes ?? [],
        scannedAt: new Date().toISOString(),
      };

      setLastScan(result);
      setScanState('success');

      addMonitoringBreadcrumb({
        category: 'nfc',
        message: 'NFC scan successful',
        data: { tagUid, techTypes: result.techTypes },
      });

      return result;
    } catch (err) {
      if (isCleanedUp.current) return null;

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const isCancelled = errorMessage.toLowerCase().includes('cancel');

      setError({
        code: isCancelled ? 'SCAN_CANCELLED' : 'SCAN_FAILED',
        message: isCancelled
          ? 'Scan was cancelled.'
          : 'Failed to read NFC tag. Please try again.',
      });
      setScanState('error');

      if (!isCancelled) {
        captureHandledException(err, { scope: 'nfc.startScan' });
      }

      return null;
    } finally {
      // Always cleanup the technology request
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch {
        // Ignore cleanup errors
      }
    }
  }, [supportStatus]);

  const cancelScan = useCallback(async () => {
    try {
      if (!isNfcSimulatorMode) {
        await getNfcManager().cancelTechnologyRequest();
      }
      setScanState('idle');
      setError(null);
    } catch {
      // Ignore errors during cancel
    }
  }, []);

  const resetState = useCallback(() => {
    setScanState('idle');
    setLastScan(null);
    setError(null);
  }, []);

  return {
    supportStatus,
    scanState,
    lastScan,
    error,
    startScan,
    cancelScan,
    resetState,
    isScanning: scanState === 'scanning',
    isSupported: supportStatus === 'supported',
  };
}
