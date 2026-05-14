import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { addMonitoringBreadcrumb, captureHandledMessage } from '../../../lib/sentry';

export type CatchPerformanceMethod = 'code' | 'camera_photo' | 'gallery_photo';
export type CatchPerformanceResult = 'success' | 'pending_approval' | 'failed' | 'timeout';

export type CatchPerformanceTimingKey =
  | 'code_lookup_ms'
  | 'maker_fetch_ms'
  | 'active_conventions_ms'
  | 'shared_conventions_ms'
  | 'photo_processing_ms'
  | 'photo_upload_ms'
  | 'edge_request_ms'
  | 'post_create_render_ms';

type CatchPerformanceTraceOptions = {
  clientAttemptId?: string;
  method: CatchPerformanceMethod;
};

type FinishOptions = {
  result: CatchPerformanceResult;
  catchId?: string | null;
  conventionId?: string | null;
  errorCode?: string | null;
};

const SLOW_TOTAL_MS = 5000;
const SLOW_EDGE_REQUEST_MS = 3000;

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const roundMs = (duration: number) => Math.max(0, Math.round(duration));

export function createClientAttemptId(): string {
  const randomUUID =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID.bind(crypto)
      : null;

  if (randomUUID) {
    return randomUUID();
  }

  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getCatchPerformanceAppVersion(): string | null {
  return (
    Constants.expoConfig?.version ??
    Constants.expoConfig?.runtimeVersion?.toString() ??
    Constants.expoConfig?.extra?.appVersion ??
    null
  );
}

export function createCatchPerformanceTrace(options: CatchPerformanceTraceOptions) {
  const clientAttemptId = options.clientAttemptId ?? createClientAttemptId();
  const startedAt = now();
  const timings: Partial<Record<CatchPerformanceTimingKey, number>> = {};

  const recordTiming = (key: CatchPerformanceTimingKey, durationMs: number | null | undefined) => {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
      return;
    }

    timings[key] = roundMs(durationMs);
  };

  const startTiming = (key: CatchPerformanceTimingKey) => {
    const phaseStartedAt = now();
    return () => recordTiming(key, now() - phaseStartedAt);
  };

  const measure = async <T>(key: CatchPerformanceTimingKey, operation: () => Promise<T>) => {
    const stop = startTiming(key);
    try {
      return await operation();
    } finally {
      stop();
    }
  };

  const finish = (finishOptions: FinishOptions) => {
    const totalMs = roundMs(now() - startedAt);
    const appVersion = getCatchPerformanceAppVersion();
    const payload = {
      client_attempt_id: clientAttemptId,
      method: options.method,
      result: finishOptions.result,
      total_ms: totalMs,
      timings,
      app_version: appVersion,
      platform: Platform.OS,
      network_type: null,
      catch_id: finishOptions.catchId ?? null,
      convention_id: finishOptions.conventionId ?? null,
      error_code: finishOptions.errorCode ?? null,
    };

    addMonitoringBreadcrumb({
      category: 'catch.performance',
      message: 'Catch performance trace completed',
      data: payload,
      level:
        finishOptions.result === 'success' || finishOptions.result === 'pending_approval'
          ? 'info'
          : 'warning',
    });

    if (
      totalMs >= SLOW_TOTAL_MS ||
      (timings.edge_request_ms ?? 0) >= SLOW_EDGE_REQUEST_MS ||
      finishOptions.result === 'failed' ||
      finishOptions.result === 'timeout'
    ) {
      captureHandledMessage('Catch performance trace completed', payload, 'warning');
    }

    return payload;
  };

  return {
    clientAttemptId,
    timings,
    finish,
    measure,
    recordTiming,
    startTiming,
  };
}
