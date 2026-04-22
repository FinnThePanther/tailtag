import type { User } from '@supabase/supabase-js';

const HAS_PASSWORD_METADATA_KEY = 'has_password';
const EMAIL_PROVIDER = 'email';

export function hasPasswordCredential(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }

  const hasPasswordCredentialMetadata = user.user_metadata?.[HAS_PASSWORD_METADATA_KEY] === true;
  const hasPasswordIdentity = user.identities?.some(
    (identity) => identity.provider === EMAIL_PROVIDER,
  );

  return Boolean(hasPasswordIdentity) || hasPasswordCredentialMetadata;
}
