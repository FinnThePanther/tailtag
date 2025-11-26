import { supabase } from '@/lib/supabase';
import { captureHandledException } from '@/lib/sentry';
import type { EmitNfcScanParams, EmitNfcScanResult } from '../types';

/**
 * Emit an NFC scan event to the backend.
 * For Phase 1, this simply records the scan in the events table.
 * Future phases will resolve the tag UID to a fursuit.
 *
 * Uses fire-and-forget pattern with 5-second timeout to match existing patterns.
 */
export async function emitNfcScan(
  params: EmitNfcScanParams
): Promise<EmitNfcScanResult | null> {
  const startTime = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const body = {
      type: 'nfc_scan',
      convention_id: params.conventionId,
      payload: {
        tag_uid: params.tagUid,
      },
      occurred_at: new Date().toISOString(),
    };

    console.log(`[emitNfcScan] Starting NFC scan emission`, {
      tagUid: params.tagUid,
      conventionId: params.conventionId,
    });

    const invokePromise = supabase.functions.invoke<{
      event_id: string;
    }>('events-ingress', { body });

    // 5-second timeout matching existing event emission pattern
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('NFC scan event emission timed out after 5 seconds'));
      }, 5000);
    });

    // Suppress unhandled rejection if timeout wins
    invokePromise.catch(() => {});

    const result = await Promise.race([invokePromise, timeoutPromise]);

    if (timeoutId) clearTimeout(timeoutId);

    const { data, error } = result;
    const duration = Date.now() - startTime;

    if (error) {
      console.error(`[emitNfcScan] Failed after ${duration}ms:`, error);
      throw error;
    }

    if (!data?.event_id) {
      throw new Error('events-ingress response missing event_id');
    }

    console.log(`[emitNfcScan] Completed in ${duration}ms`, {
      eventId: data.event_id,
    });

    return {
      eventId: data.event_id,
      tagUid: params.tagUid,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    console.error(`[emitNfcScan] Failed after ${duration}ms:`, error);

    captureHandledException(error, {
      scope: 'nfc.emitNfcScan',
      tagUid: params.tagUid,
      conventionId: params.conventionId,
      duration,
    });

    // Return null for graceful degradation (matches existing pattern)
    return null;
  }
}
