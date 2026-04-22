import type { User } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';

const EMAIL_PROVIDER = 'email';
export const CURRENT_USER_HAS_PASSWORD_CREDENTIAL_QUERY_KEY =
  'current-user-has-password-credential';
export const PASSWORD_CREDENTIAL_STALE_TIME = 60_000;

export const currentUserHasPasswordCredentialQueryKey = (userId: string | null) =>
  [CURRENT_USER_HAS_PASSWORD_CREDENTIAL_QUERY_KEY, userId] as const;

export const createCurrentUserHasPasswordCredentialQueryOptions = (userId: string | null) => ({
  queryKey: currentUserHasPasswordCredentialQueryKey(userId),
  enabled: Boolean(userId),
  staleTime: PASSWORD_CREDENTIAL_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  queryFn: () => fetchCurrentUserHasPasswordCredential(),
});

export function inferPasswordCredentialFromSession(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }

  const hasPasswordIdentity = user.identities?.some(
    (identity) => identity.provider === EMAIL_PROVIDER,
  );

  return Boolean(hasPasswordIdentity);
}

export async function fetchCurrentUserHasPasswordCredential(): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('current_user_has_password_credential');

  if (error) {
    throw new Error(error.message);
  }

  return data === true;
}
