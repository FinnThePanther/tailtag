import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { AppImage } from '../../../src/components/ui/AppImage';
import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { FursuitCard } from '../../../src/features/suits';
import { useAuth } from '../../../src/features/auth';
import { createProfileQueryOptions } from '../../../src/features/profile';
import { ProfileActionMenu, checkIsBlocked } from '../../../src/features/moderation';
import { fetchMySuits, mySuitsQueryKey, MY_SUITS_STALE_TIME } from '../../../src/features/suits';
import {
  fetchUserUnlockedAchievements,
  userUnlockedAchievementsQueryKey,
} from '../../../src/features/achievements';
import {
  createUserCatchCountQueryOptions,
  createUserConventionCountQueryOptions,
  aggregateSocialLinks,
  ProfileHeaderSkeleton,
  StatsGridSkeleton,
  FursuitsListSkeleton,
  AchievementsListSkeleton,
} from '../../../src/features/public-profile';
import { useAllDataReady } from '../../../src/hooks/useAllDataReady';
import { captureNonCriticalError } from '../../../src/lib/sentry';
import { colors } from '../../../src/theme';
import { normalizeSocialUrlForOpening } from '../../../src/utils/socialLinks';
import { styles } from '../../../src/app-styles/profile/[id]/index.styles';

const openSocialLink = async (url: string) => {
  const normalizedUrl = normalizeSocialUrlForOpening(url);

  try {
    const canOpen = await Linking.canOpenURL(normalizedUrl);
    if (!canOpen) {
      Alert.alert('Link unavailable', "We couldn't open that social link on this device.");
      return;
    }
    await Linking.openURL(normalizedUrl);
  } catch (error) {
    captureNonCriticalError(error, { scope: 'publicProfile.openSocialLink', url: normalizedUrl });
    Alert.alert('Link unavailable', "We couldn't open that social link. Try again later.");
  }
};

export default function PublicProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const profileId = typeof params.id === 'string' ? params.id : null;

  const isSelf = Boolean(profileId && currentUserId && profileId === currentUserId);

  const profileQuery = useQuery({
    ...createProfileQueryOptions(profileId ?? ''),
    enabled: Boolean(profileId),
  });
  const { data: profile, error: profileError, refetch: refetchProfile } = profileQuery;

  const fursuitsQuery = useQuery({
    queryKey: mySuitsQueryKey(profileId ?? ''),
    queryFn: () => fetchMySuits(profileId ?? ''),
    staleTime: MY_SUITS_STALE_TIME,
    enabled: Boolean(profileId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { data: fursuits = [], error: suitsError } = fursuitsQuery;

  const { width: screenWidth } = useWindowDimensions();

  const achievementsQuery = useQuery({
    queryKey: userUnlockedAchievementsQueryKey(profileId ?? ''),
    queryFn: () => fetchUserUnlockedAchievements(profileId ?? ''),
    staleTime: 5 * 60_000,
    enabled: Boolean(profileId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { data: unlockedAchievements = [] } = achievementsQuery;

  const catchCountQuery = useQuery({
    ...createUserCatchCountQueryOptions(profileId ?? ''),
    enabled: Boolean(profileId),
  });
  const { data: catchCount = 0 } = catchCountQuery;

  const conventionCountQuery = useQuery({
    ...createUserConventionCountQueryOptions(profileId ?? ''),
    enabled: Boolean(profileId),
  });
  const { data: conventionCount = 0 } = conventionCountQuery;

  const isBlockedQuery = useQuery({
    queryKey: ['is-blocked', currentUserId, profileId],
    queryFn: () => checkIsBlocked(profileId!),
    enabled: Boolean(profileId) && Boolean(currentUserId) && !isSelf,
    staleTime: 2 * 60_000,
  });
  const { data: isBlocked = false } = isBlockedQuery;

  const avatarUrl = profile?.avatar_url ?? (fursuits.length > 0 ? fursuits[0].avatar_url : null);
  const socialLinks = aggregateSocialLinks(fursuits, profile?.social_links ?? []);

  const [headerAvatarLoaded, setHeaderAvatarLoaded] = useState(false);
  useEffect(() => {
    setHeaderAvatarLoaded(false);
  }, [profileId]);

  // Tier 1: profile header (isBlockedQuery treated as ready in self-view since it's disabled)
  const tier1Ready =
    (profileQuery.data !== undefined || profileQuery.isError) &&
    (isSelf || isBlockedQuery.data !== undefined || isBlockedQuery.isError);
  // Tier 2: stats, fursuits, achievements — all reveal together
  const tier2Ready = useAllDataReady([
    fursuitsQuery,
    achievementsQuery,
    catchCountQuery,
    conventionCountQuery,
  ]);

  const profileOwnAvatarUrl = profile?.avatar_url ?? null;
  const headerRevealReady = tier1Ready && (!profileOwnAvatarUrl || headerAvatarLoaded);

  if (!profileId) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          title="Player Profile"
          onBack={() => router.back()}
        />
        <View style={styles.centeredMessage}>
          <Text style={styles.message}>Player not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={profile?.username ?? 'Player Profile'}
        onBack={() => router.back()}
        right={
          isSelf ? (
            <Pressable
              onPress={() => router.push('/(tabs)/settings')}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <Text style={styles.headerButton}>Edit</Text>
            </Pressable>
          ) : profileId ? (
            <ProfileActionMenu
              profileId={profileId}
              profileUsername={profile?.username}
            />
          ) : undefined
        }
      />

      {isBlocked ? (
        <View style={styles.centeredMessage}>
          <Ionicons
            name="ban-outline"
            size={48}
            color="rgba(148,163,184,0.5)"
          />
          <Text style={styles.message}>Profile unavailable</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
        >
          {/* Profile header */}
          <TailTagCard>
            {profileError ? (
              <View style={styles.errorBlock}>
                <Text style={styles.errorText}>Could not load this profile.</Text>
                <TailTagButton
                  variant="outline"
                  size="sm"
                  onPress={() => refetchProfile()}
                >
                  Try again
                </TailTagButton>
              </View>
            ) : (
              <View>
                {tier1Ready && (
                  <View style={[styles.profileHeader, !headerRevealReady && { opacity: 0 }]}>
                    <View style={styles.profileAvatarWrapper}>
                      {avatarUrl ? (
                        <AppImage
                          url={avatarUrl}
                          width={screenWidth}
                          height={screenWidth}
                          style={styles.profileAvatar}
                          onLoad={() => setHeaderAvatarLoaded(true)}
                        />
                      ) : (
                        <View style={styles.profileAvatarFallback}>
                          <Ionicons
                            name="person"
                            size={48}
                            color="rgba(148,163,184,0.4)"
                          />
                        </View>
                      )}
                    </View>
                    <Text style={styles.username}>{profile?.username}</Text>
                    {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
                  </View>
                )}
                {!headerRevealReady && (
                  <View
                    style={
                      tier1Ready
                        ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }
                        : undefined
                    }
                  >
                    <ProfileHeaderSkeleton />
                  </View>
                )}
              </View>
            )}
          </TailTagCard>

          {/* Stats */}
          <TailTagCard>
            <Text style={styles.sectionTitle}>Stats</Text>
            {!tier2Ready ? (
              <StatsGridSkeleton />
            ) : (
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{catchCount.toLocaleString()}</Text>
                  <Text style={styles.statLabel}>Fursuits caught</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{conventionCount.toLocaleString()}</Text>
                  <Text style={styles.statLabel}>Conventions attended</Text>
                </View>
              </View>
            )}
          </TailTagCard>

          {/* Social links — only shown if any exist */}
          {tier2Ready && socialLinks.length > 0 ? (
            <TailTagCard>
              <Text style={styles.sectionTitle}>Social links</Text>
              <View style={styles.socialList}>
                {socialLinks.map((link) => (
                  <Pressable
                    key={`${link.label}-${link.url}`}
                    style={styles.socialLink}
                    onPress={() => openSocialLink(link.url)}
                  >
                    <Text style={styles.socialLabel}>{link.label}</Text>
                  </Pressable>
                ))}
              </View>
            </TailTagCard>
          ) : null}

          {/* Fursuits */}
          <TailTagCard>
            <Text style={styles.sectionTitle}>
              Fursuits{fursuits.length > 0 ? ` (${fursuits.length})` : ''}
            </Text>
            {!tier2Ready ? (
              <FursuitsListSkeleton />
            ) : suitsError ? (
              <Text style={styles.errorText}>Could not load fursuits.</Text>
            ) : fursuits.length === 0 ? (
              <Text style={styles.message}>No fursuits registered yet.</Text>
            ) : (
              <View style={styles.suitsList}>
                {fursuits.map((fursuit) => (
                  <Pressable
                    key={fursuit.id}
                    onPress={() =>
                      router.push({ pathname: '/fursuits/[id]', params: { id: fursuit.id } })
                    }
                  >
                    <FursuitCard
                      name={fursuit.name}
                      species={fursuit.species}
                      colors={fursuit.colors}
                      avatarUrl={fursuit.avatar_url}
                      uniqueCode={fursuit.unique_code}
                    />
                  </Pressable>
                ))}
              </View>
            )}
          </TailTagCard>

          {/* Achievements */}
          <TailTagCard>
            <Text style={styles.sectionTitle}>
              Achievements
              {unlockedAchievements.length > 0 ? ` (${unlockedAchievements.length})` : ''}
            </Text>
            {!tier2Ready ? (
              <AchievementsListSkeleton />
            ) : unlockedAchievements.length === 0 ? (
              <Text style={styles.message}>No achievements earned yet.</Text>
            ) : (
              <View style={styles.achievementList}>
                {unlockedAchievements.map((achievement) => (
                  <View
                    key={achievement.id}
                    style={styles.achievementRow}
                  >
                    <View style={styles.achievementIcon}>
                      <Ionicons
                        name="trophy"
                        size={16}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.achievementText}>
                      <Text style={styles.achievementName}>{achievement.name}</Text>
                      <Text
                        style={styles.achievementDescription}
                        numberOfLines={2}
                      >
                        {achievement.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </TailTagCard>
        </ScrollView>
      )}
    </View>
  );
}
