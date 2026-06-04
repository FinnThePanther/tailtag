import * as QueryParams from 'expo-auth-session/build/QueryParams';

import { supabase } from '../../../lib/supabase';

type RecoverySessionTokens = {
  accessToken: string;
  refreshToken: string;
};

type RecoverySessionParams =
  | {
      type: 'code';
      code: string;
    }
  | {
      type: 'tokens';
      accessToken: string;
      refreshToken: string;
    };

export const RECOVERY_SESSION_READY_PARAM = 'recoverySession';
export const RECOVERY_SESSION_ERROR_PARAM = 'recoveryError';
export const RECOVERY_SESSION_ERROR_VALUE = 'invalid';

let completedRecoverySessionMarker: string | null = null;

export function getCompletedRecoverySessionMarker() {
  return completedRecoverySessionMarker;
}

export function consumeCompletedRecoverySessionMarker(marker: string | null) {
  if (!marker || marker !== completedRecoverySessionMarker) {
    return false;
  }

  completedRecoverySessionMarker = null;
  return true;
}

export function getRecoverySessionTokens(
  url: string | null | undefined,
): RecoverySessionTokens | null {
  const params = getRecoverySessionParams(url);

  if (params?.type !== 'tokens') {
    return null;
  }

  return {
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
  };
}

export function getRecoverySessionParams(
  url: string | null | undefined,
): RecoverySessionParams | null {
  if (!url) {
    return null;
  }

  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode || typeof params.error === 'string') {
    return null;
  }

  const code = typeof params.code === 'string' ? params.code : null;
  const accessToken = typeof params.access_token === 'string' ? params.access_token : null;
  const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : null;
  const type = typeof params.type === 'string' ? params.type : null;

  if (code) {
    return {
      type: 'code',
      code,
    };
  }

  if (type !== 'recovery' || !accessToken || !refreshToken) {
    return null;
  }

  return {
    type: 'tokens',
    accessToken,
    refreshToken,
  };
}

export async function completeRecoverySessionFromUrl(url: string | null | undefined) {
  const params = getRecoverySessionParams(url);

  if (!params) {
    return false;
  }

  const { error } =
    params.type === 'code'
      ? await supabase.auth.exchangeCodeForSession(params.code)
      : await supabase.auth.setSession({
          access_token: params.accessToken,
          refresh_token: params.refreshToken,
        });

  if (error) {
    throw error;
  }

  completedRecoverySessionMarker = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  return true;
}
