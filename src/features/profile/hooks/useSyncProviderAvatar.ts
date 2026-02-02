import { useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

import { AVATAR_BUCKET } from '../../../constants/storage';
import { supabase } from '../../../lib/supabase';
import { captureNonCriticalError } from '../../../lib/sentry';
import { deriveStoragePathFromPublicUrl } from '../../../utils/storage';
import { consumeStoredProviderToken } from '../../auth/utils/oauth';
import type { ProfileSummary } from '../api/profile';
import { profileQueryKey } from '../api/profile';

type Params = {
  session: Session | null;
  profile: ProfileSummary | null | undefined;
};

const SYNCABLE_PROVIDERS = new Set(['discord', 'google', 'apple']);
const AVATAR_FIELDS = ['avatar_url', 'picture', 'avatar', 'image', 'photo', 'app_avatar_url'];
const isHttpUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const buildDiscordAvatarUrl = (metadata: Record<string, unknown>) => {
  const providerId =
    typeof metadata.provider_id === 'string'
      ? metadata.provider_id
      : typeof metadata.id === 'string'
        ? metadata.id
        : null;
  const avatarHash = typeof metadata.avatar === 'string' ? metadata.avatar : null;
  const size = 1024;

  if (providerId && avatarHash) {
    return `https://cdn.discordapp.com/avatars/${providerId}/${avatarHash}.png?size=${size}`;
  }

  return null;
};

const extractCandidateAvatarUrl = (provider: string | null, metadata: Record<string, unknown>) => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  for (const field of AVATAR_FIELDS) {
    const value = metadata[field];
    if (isHttpUrl(value)) {
      return String(value);
    }
  }

  if (provider === 'discord') {
    const discordUrl = buildDiscordAvatarUrl(metadata);
    if (discordUrl) {
      return discordUrl;
    }
  }

  return null;
};

const isStorageAvatarUrl = (url: string | null | undefined) =>
  Boolean(url && deriveStoragePathFromPublicUrl(url, AVATAR_BUCKET));

export function useSyncProviderAvatar({ session, profile }: Params) {
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);
  const syncedUsersRef = useRef(new Set<string>());

  useEffect(() => {
    if (!session) {
      syncedUsersRef.current.clear();
      return;
    }

    const userId = session.user.id;
    const provider =
      typeof session.user.app_metadata?.provider === 'string'
        ? session.user.app_metadata.provider
        : null;

    if (!provider || !SYNCABLE_PROVIDERS.has(provider)) {
      return;
    }

    if (syncedUsersRef.current.has(userId)) {
      return;
    }

    if (profile === undefined) {
      return;
    }

    if (isStorageAvatarUrl(profile?.avatar_url)) {
      syncedUsersRef.current.add(userId);
      return;
    }

    const combinedMetadata: Record<string, unknown> = {};

    if (Array.isArray(session.user.identities)) {
      const identity = session.user.identities.find((item) => item.provider === provider);
      if (identity && identity.identity_data && typeof identity.identity_data === 'object') {
        Object.assign(combinedMetadata, identity.identity_data);
      }
    }

    if (session.user.user_metadata && typeof session.user.user_metadata === 'object') {
      Object.assign(combinedMetadata, session.user.user_metadata);
    }

    if (
      session.user.app_metadata &&
      typeof session.user.app_metadata === 'object' &&
      session.user.app_metadata.avatar_url
    ) {
      combinedMetadata.app_avatar_url = session.user.app_metadata.avatar_url;
    }

    const candidateUrl = extractCandidateAvatarUrl(provider, combinedMetadata);
    const providerAllowsFallback = provider === 'google';

    if (!candidateUrl || !isHttpUrl(candidateUrl) || isStorageAvatarUrl(candidateUrl)) {
      if (!providerAllowsFallback) {
        return;
      }
    }

    if (syncingRef.current) {
      return;
    }

    syncingRef.current = true;
    const sync = async () => {
      try {
        const accessToken = session.access_token;
        if (!accessToken) {
          throw new Error('No access token available for avatar sync.');
        }

        let googleProviderToken: string | null = null;
        if (provider === 'google') {
          googleProviderToken =
            typeof (session as any).provider_token === 'string'
              ? (session as any).provider_token
              : (() => {
                  const identity = session.user.identities?.find((item) => item.provider === 'google');
                  if (identity && identity.identity_data && typeof identity.identity_data === 'object') {
                    const maybeAccessToken = (identity.identity_data as Record<string, unknown>).access_token;
                    return typeof maybeAccessToken === 'string' ? maybeAccessToken : null;
                  }
                  return null;
                })();

          if (!googleProviderToken) {
            const storedTokenPayload = consumeStoredProviderToken('google');
            if (storedTokenPayload?.accessToken) {
              googleProviderToken = storedTokenPayload.accessToken;
            }
          }

          if (!googleProviderToken) {
            return;
          }
        }

        const payload =
          provider === 'google'
            ? { accessToken: googleProviderToken, provider }
            : { sourceUrl: candidateUrl };

        const { data, error } = await supabase.functions.invoke<{
          avatarUrl?: string;
        }>('sync-provider-avatar', {
          body: {
            ...payload,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (error) {
          throw new Error(error.message ?? 'Unable to sync provider avatar.');
        }

        if (!data || typeof data.avatarUrl !== 'string') {
          throw new Error('Avatar sync did not return a stored URL.');
        }

        const nextAvatarUrl = data.avatarUrl as string;

        queryClient.setQueryData<ProfileSummary | null>(profileQueryKey(userId), (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            avatar_url: nextAvatarUrl,
          };
        });

        syncedUsersRef.current.add(userId);
      } catch (caught) {
        captureNonCriticalError(caught, {
          scope: 'profile.syncProviderAvatar',
          userId,
          provider,
        });
      } finally {
        syncingRef.current = false;
      }
    };

    void sync();

  }, [profile, queryClient, session]);
}
