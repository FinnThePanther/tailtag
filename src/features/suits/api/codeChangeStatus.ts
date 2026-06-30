import { captureHandledException, captureSupabaseError } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';

export const FURSUIT_CODE_CHANGE_STATUS_QUERY_KEY = 'fursuit-code-change-status';
export const fursuitCodeChangeStatusQueryKey = (fursuitId: string, viewerId?: string | null) =>
  viewerId
    ? ([FURSUIT_CODE_CHANGE_STATUS_QUERY_KEY, fursuitId, viewerId] as const)
    : ([FURSUIT_CODE_CHANGE_STATUS_QUERY_KEY, fursuitId] as const);

export type FursuitCodeChangeStatus =
  | {
      status: 'available';
      fursuitId: string;
      remainingChanges: number;
      hasChangedCode: boolean;
    }
  | {
      status: 'locked';
      fursuitId: string;
      remainingChanges: number;
      hasChangedCode: boolean;
    }
  | {
      status: 'not_found';
      fursuitId: string;
      remainingChanges: 0;
      hasChangedCode: false;
    };

type RawFursuitCodeChangeStatus = {
  status?: unknown;
  fursuit_id?: unknown;
  remaining_changes?: unknown;
  has_changed_code?: unknown;
};

const parseFursuitCodeChangeStatus = (value: unknown): FursuitCodeChangeStatus => {
  if (!value || typeof value !== 'object') {
    throw new Error('Malformed get_fursuit_code_change_status response');
  }

  const result = value as RawFursuitCodeChangeStatus;
  const fursuitId = typeof result.fursuit_id === 'string' ? result.fursuit_id : null;

  if (!fursuitId) {
    throw new Error('Malformed get_fursuit_code_change_status response');
  }

  if (result.status === 'not_found') {
    return {
      status: 'not_found',
      fursuitId,
      remainingChanges: 0,
      hasChangedCode: false,
    };
  }

  const remainingChanges =
    typeof result.remaining_changes === 'number' && Number.isFinite(result.remaining_changes)
      ? Math.max(0, Math.floor(result.remaining_changes))
      : 0;
  const hasChangedCode = result.has_changed_code === true;

  if (result.status === 'available') {
    return {
      status: 'available',
      fursuitId,
      remainingChanges,
      hasChangedCode,
    };
  }

  if (result.status === 'locked') {
    return {
      status: 'locked',
      fursuitId,
      remainingChanges,
      hasChangedCode,
    };
  }

  throw new Error('Malformed get_fursuit_code_change_status response');
};

export async function fetchFursuitCodeChangeStatus(
  fursuitId: string,
): Promise<FursuitCodeChangeStatus> {
  const { data, error } = await (supabase as any).rpc('get_fursuit_code_change_status', {
    p_fursuit_id: fursuitId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'suits.fetchFursuitCodeChangeStatus',
      action: 'get_fursuit_code_change_status',
      rpc: 'get_fursuit_code_change_status',
      fursuitId,
    });
    throw error;
  }

  try {
    return parseFursuitCodeChangeStatus(data);
  } catch (parseError) {
    captureHandledException(parseError, {
      scope: 'suits.fetchFursuitCodeChangeStatus.parse',
      action: 'parse_get_fursuit_code_change_status',
      rpc: 'get_fursuit_code_change_status',
      fursuitId,
      additionalContext: {
        responseType: typeof data,
      },
    });
    throw parseError;
  }
}
