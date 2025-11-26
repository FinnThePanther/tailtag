import { useState, useCallback } from 'react';
import { addMonitoringBreadcrumb } from '@/lib/sentry';
import { useNfcScanner } from './useNfcScanner';
import {
  checkTagStatus,
  registerTag,
  linkTagToFursuit,
} from '../api/nfcTags';
import type {
  TagCheckResult,
  TagRegistrationError,
  TagRegistrationErrorCode,
} from '../types';

export type RegistrationStep =
  | 'idle'
  | 'scanning'
  | 'checking'
  | 'registering'
  | 'linking'
  | 'complete'
  | 'error'
  | 'conflict'; // Tag belongs to another user

export type RegistrationState = {
  step: RegistrationStep;
  scannedUid: string | null;
  checkResult: TagCheckResult | null;
  error: TagRegistrationError | null;
  linkedFursuitId: string | null;
};

const initialState: RegistrationState = {
  step: 'idle',
  scannedUid: null,
  checkResult: null,
  error: null,
  linkedFursuitId: null,
};

/**
 * Hook for managing the NFC tag registration flow.
 *
 * Flow:
 * 1. idle - waiting for user to initiate
 * 2. scanning - NFC scanner active
 * 3. checking - checking tag status on backend
 * 4. registering - registering new tag (if new)
 * 5. linking - linking tag to fursuit
 * 6. complete - registration successful
 *
 * Error states:
 * - error - general error occurred
 * - conflict - tag belongs to another user
 */
export function useTagRegistration(fursuitId: string) {
  const [state, setState] = useState<RegistrationState>(initialState);
  const scanner = useNfcScanner();

  const setStep = useCallback((step: RegistrationStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const setError = useCallback(
    (code: TagRegistrationErrorCode, message: string) => {
      setState((prev) => ({
        ...prev,
        step: 'error',
        error: { code, message },
      }));
    },
    []
  );

  /**
   * Start the registration flow - scan, check, register, and link.
   */
  const startRegistration = useCallback(async () => {
    setState({ ...initialState, step: 'scanning' });

    addMonitoringBreadcrumb({
      category: 'nfc',
      message: 'Starting tag registration',
      data: { fursuitId },
    });

    // Step 1: Scan the tag
    const scanResult = await scanner.startScan();

    if (!scanResult) {
      // Scan was cancelled or failed - scanner hook handles error state
      setState((prev) => ({
        ...prev,
        step: scanner.error ? 'error' : 'idle',
        error: scanner.error
          ? { code: scanner.error.code as TagRegistrationErrorCode, message: scanner.error.message }
          : null,
      }));
      return;
    }

    const tagUid = scanResult.tagUid;
    setState((prev) => ({ ...prev, scannedUid: tagUid, step: 'checking' }));

    // Step 2: Check tag status
    let checkResult: TagCheckResult;
    try {
      checkResult = await checkTagStatus(tagUid);
    } catch {
      setError('NETWORK_ERROR', 'Failed to check tag status');
      return;
    }

    setState((prev) => ({ ...prev, checkResult }));

    // Step 3: Handle based on check result
    if (checkResult.exists) {
      if (!checkResult.isMine) {
        // Tag belongs to another user
        setState((prev) => ({
          ...prev,
          step: 'conflict',
          error: {
            code: 'TAG_BELONGS_TO_ANOTHER_USER',
            message: 'This tag is registered to another user.',
          },
        }));
        return;
      }

      // Tag is mine - check if already linked to this fursuit
      if (checkResult.fursuitId === fursuitId && checkResult.status === 'active') {
        setState((prev) => ({
          ...prev,
          step: 'complete',
          linkedFursuitId: fursuitId,
        }));
        return;
      }

      // Tag is mine but linked elsewhere or not active - try to link
      setStep('linking');
    } else {
      // Tag is new - register it first
      setStep('registering');

      const registerResult = await registerTag(tagUid);

      if ('code' in registerResult) {
        setState((prev) => ({
          ...prev,
          step: 'error',
          error: registerResult,
        }));
        return;
      }

      setStep('linking');
    }

    // Step 4: Link tag to fursuit
    const linkResult = await linkTagToFursuit(tagUid, fursuitId);

    if ('code' in linkResult) {
      setState((prev) => ({
        ...prev,
        step: 'error',
        error: linkResult,
      }));
      return;
    }

    // Success!
    setState((prev) => ({
      ...prev,
      step: 'complete',
      linkedFursuitId: fursuitId,
    }));

    addMonitoringBreadcrumb({
      category: 'nfc',
      message: 'Tag registration complete',
      data: { tagUid, fursuitId },
    });
  }, [fursuitId, scanner, setStep, setError]);

  /**
   * Reset the registration flow to idle state.
   */
  const reset = useCallback(() => {
    setState(initialState);
    scanner.resetState();
  }, [scanner]);

  /**
   * Cancel an in-progress scan.
   */
  const cancelScan = useCallback(async () => {
    await scanner.cancelScan();
    setState(initialState);
  }, [scanner]);

  return {
    // State
    ...state,

    // Scanner state (for NFC support status)
    supportStatus: scanner.supportStatus,
    isSupported: scanner.isSupported,

    // Computed
    isProcessing:
      state.step === 'scanning' ||
      state.step === 'checking' ||
      state.step === 'registering' ||
      state.step === 'linking',

    // Actions
    startRegistration,
    reset,
    cancelScan,
  };
}
