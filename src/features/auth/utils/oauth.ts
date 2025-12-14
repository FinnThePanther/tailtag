import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';

import { supabase } from '../../../lib/supabase';

const OAUTH_SCHEME = 'tailtag';
const OAUTH_CALLBACK_PATH = 'auth/callback';

export const getOAuthRedirectUri = () =>
  AuthSession.makeRedirectUri({
    scheme: OAUTH_SCHEME,
    path: OAUTH_CALLBACK_PATH,
  });

export const isOAuthCallbackUrl = (url: string) => url.includes(OAUTH_CALLBACK_PATH);

export const completeOAuthSessionFromUrl = async (url: string) => {
  if (!isOAuthCallbackUrl(url)) {
    return false;
  }

  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  if (typeof params.error === 'string') {
    throw new Error(params.error_description ?? params.error);
  }

  const accessToken = typeof params.access_token === 'string' ? params.access_token : null;
  const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : null;

  if (!accessToken || !refreshToken) {
    return false;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  return Boolean(data.session);
};
