import { supabase } from '@/lib/supabase';
import { captureHandledException } from '@/lib/sentry';
import type { EmitNfcScanParams, EmitNfcScanResult } from '../types';

function getNfcEventTelemetry(params: EmitNfcScanParams, duration?: number) {
  return {
    scope: 'nfc.emitNfcScan',
    conventionId: params.conventionId,
    hasTagUid: Boolean(params.tagUid),
    duration,
  };
}

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

    if (error) {
      throw error;
    }

    if (!data?.event_id) {
      throw new Error('events-ingress response missing event_id');
    }

    return {
      eventId: data.event_id,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    captureHandledException(error, getNfcEventTelemetry(params, duration));

    // Return null for graceful degradation (matches existing pattern)
    return null;
  }
}
