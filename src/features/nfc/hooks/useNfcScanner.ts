import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getNfcManager,
  getNfcTech,
  isNfcSimulatorMode,
} from '../lib/nfcManager';
import {
  captureNonCriticalError,
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

  // Initialize NFC manager on mount
  useEffect(() => {
    let mounted = true;

    async function initializeNfc() {
      // During testing/simulator, skip actual NFC checks
      if (isNfcSimulatorMode) {
        if (mounted) {
          setSupportStatus('unsupported');
        }
        return;
      }

      const NfcManager = getNfcManager();

      try {
        // Check if device supports NFC
        const isSupported = await NfcManager.isSupported();
        if (!isSupported) {
          if (mounted) {
            setSupportStatus('unsupported');
          }
          return;
        }

        // Start the NFC manager
        await NfcManager.start();

        // Check if NFC is enabled in device settings
        const isEnabled = await NfcManager.isEnabled();
        if (!isEnabled) {
          if (mounted) {
            setSupportStatus('disabled');
          }
          return;
        }

        if (mounted) {
          setSupportStatus('supported');
        }
      } catch (err) {
        if (mounted) {
          captureNonCriticalError(err, { scope: 'nfc.initialize' });
          // If initialization fails, treat as unsupported
          setSupportStatus('unsupported');
        }
      }
    }

    initializeNfc();

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
        techTypes: tag.techTypes ?? [],
        scannedAt: new Date().toISOString(),
      };

      setLastScan(result);
      setScanState('success');

      addMonitoringBreadcrumb({
        category: 'nfc',
        message: 'NFC scan successful',
        data: {
          hasTagUid: Boolean(tagUid),
          techTypeCount: result.techTypes.length,
        },
      });

      return result;
    } catch (err) {
      if (isCleanedUp.current) return null;

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const lowerMessage = errorMessage.toLowerCase();

      // Detect user cancellation - iOS and Android have different messages
      const isCancelled =
        lowerMessage.includes('cancel') ||
        lowerMessage.includes('invalidate') || // iOS: session invalidated
        lowerMessage.includes('user did not') || // iOS: user did not hold phone near
        lowerMessage.includes('session timeout') || // iOS: session timed out
        lowerMessage.includes('system resource unavailable'); // iOS: another app using NFC

      // Android throws these errors when NFC is off or unavailable
      const isNfcOff =
        lowerMessage.includes('nfc adapter') ||
        lowerMessage.includes('nfc is not enabled') ||
        lowerMessage.includes('no tech request available') ||
        lowerMessage.includes('nfc not available');

      // For user cancellation, just reset to idle state (no error shown)
      if (isCancelled) {
        setScanState('idle');
        setError(null);
        return null;
      }

      let code: NfcScanError['code'];
      let message: string;

      if (isNfcOff) {
        code = 'NFC_DISABLED';
        message = 'NFC is turned off. Please enable NFC in your device settings and try again.';
        // Update support status so UI can show appropriate message
        setSupportStatus('disabled');
      } else {
        code = 'SCAN_FAILED';
        message = 'Failed to read NFC tag. Please try again.';
      }

      setError({ code, message });
      setScanState('error');

      captureNonCriticalError(err, {
        scope: 'nfc.startScan',
        extra: { errorMessage, isNfcOff },
      });

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
