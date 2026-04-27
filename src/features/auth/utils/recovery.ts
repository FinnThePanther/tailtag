import * as QueryParams from 'expo-auth-session/build/QueryParams';

import { supabase } from '../../../lib/supabase';

type RecoverySessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export const RECOVERY_SESSION_READY_PARAM = 'recoverySession';
export const RECOVERY_SESSION_READY_VALUE = 'ready';

let completedRecoverySessionInRuntime = false;

export function hasCompletedRecoverySessionInRuntime() {
  return completedRecoverySessionInRuntime;
}

export function getRecoverySessionTokens(
  url: string | null | undefined,
): RecoverySessionTokens | null {
  if (!url) {
    return null;
  }

  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode || typeof params.error === 'string') {
    return null;
  }

  const accessToken = typeof params.access_token === 'string' ? params.access_token : null;
  const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : null;
  const type = typeof params.type === 'string' ? params.type : null;

  if (type !== 'recovery' || !accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

export async function completeRecoverySessionFromUrl(url: string | null | undefined) {
  const tokens = getRecoverySessionTokens(url);

  if (!tokens) {
    return false;
  }

  const { error } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  if (error) {
    throw error;
  }

  completedRecoverySessionInRuntime = true;

  return true;
}
