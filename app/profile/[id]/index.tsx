import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { FursuitCard } from '../../../src/features/suits';
import { useAuth } from '../../../src/features/auth';
import { createProfileQueryOptions } from '../../../src/features/profile';
import {
  fetchMySuits,
  mySuitsQueryKey,
  MY_SUITS_STALE_TIME,
} from '../../../src/features/suits';
import {
  fetchAchievementStatus,
  achievementsStatusQueryKey,
  type AchievementWithStatus,
} from '../../../src/features/achievements';
import {
  createUserCatchCountQueryOptions,
  createUserConventionCountQueryOptions,
  aggregateSocialLinks,
} from '../../../src/features/public-profile';
import { captureNonCriticalError } from '../../../src/lib/sentry';
import { colors, radius, spacing } from '../../../src/theme';

const openSocialLink = async (url: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Link unavailable', "We couldn't open that social link on this device.");
      return;
    }
    await Linking.openURL(url);
  } catch (error) {
    captureNonCriticalError(error, { scope: 'publicProfile.openSocialLink', url });
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

  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery({
    ...createProfileQueryOptions(profileId ?? ''),
    enabled: Boolean(profileId),
  });

  const {
    data: fursuits = [],
    isLoading: isSuitsLoading,
    error: suitsError,
  } = useQuery({
    queryKey: mySuitsQueryKey(profileId ?? ''),
    queryFn: () => fetchMySuits(profileId ?? ''),
    staleTime: MY_SUITS_STALE_TIME,
    enabled: Boolean(profileId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const {
    data: achievementStatus = [],
    isLoading: isAchievementsLoading,
  } = useQuery({
    queryKey: achievementsStatusQueryKey(profileId ?? ''),
    queryFn: () => fetchAchievementStatus(profileId ?? ''),
    staleTime: 5 * 60_000,
    enabled: Boolean(profileId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: catchCount = 0, isLoading: isCatchCountLoading } = useQuery({
    ...createUserCatchCountQueryOptions(profileId ?? ''),
    enabled: Boolean(profileId),
  });

  const { data: conventionCount = 0, isLoading: isConventionCountLoading } = useQuery({
    ...createUserConventionCountQueryOptions(profileId ?? ''),
    enabled: Boolean(profileId),
  });

  const avatarUrl = profile?.avatar_url ?? (fursuits.length > 0 ? fursuits[0].avatar_url : null);
  const socialLinks = aggregateSocialLinks(fursuits, profile?.social_links ?? []);
  const unlockedAchievements = achievementStatus.filter(
    (a: AchievementWithStatus) => a.unlocked,
  );

  const isStatsLoading = isCatchCountLoading || isConventionCountLoading;

  if (!profileId) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Player Profile" onBack={() => router.back()} />
        <View style={styles.centeredMessage}>
          <Text style={styles.message}>Player not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Player Profile"
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
          ) : undefined
        }
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {/* Profile header */}
        <TailTagCard>
          {isProfileLoading ? (
            <Text style={styles.message}>Loading profile…</Text>
          ) : profileError ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>Could not load this profile.</Text>
              <TailTagButton variant="outline" size="sm" onPress={() => refetchProfile()}>
                Try again
              </TailTagButton>
            </View>
          ) : (
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person-circle-outline" size={72} color="rgba(148,163,184,0.5)" />
                  </View>
                )}
              </View>
              <Text style={styles.username}>
                {profile?.username ?? 'Unnamed player'}
              </Text>
              {profile?.bio ? (
                <Text style={styles.bio}>{profile.bio}</Text>
              ) : null}
            </View>
          )}
        </TailTagCard>

        {/* Stats */}
        <TailTagCard>
          <Text style={styles.sectionTitle}>Stats</Text>
          {isStatsLoading ? (
            <Text style={styles.message}>Loading stats…</Text>
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
        {!isSuitsLoading && socialLinks.length > 0 ? (
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
                  <Text style={styles.socialUrl} numberOfLines={1}>
                    {link.url}
                  </Text>
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
          {isSuitsLoading ? (
            <Text style={styles.message}>Loading fursuits…</Text>
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
            Achievements{unlockedAchievements.length > 0 ? ` (${unlockedAchievements.length})` : ''}
          </Text>
          {isAchievementsLoading ? (
            <Text style={styles.message}>Loading achievements…</Text>
          ) : unlockedAchievements.length === 0 ? (
            <Text style={styles.message}>No achievements earned yet.</Text>
          ) : (
            <View style={styles.achievementList}>
              {unlockedAchievements.map((achievement) => (
                <View key={achievement.id} style={styles.achievementRow}>
                  <View style={styles.achievementIcon}>
                    <Ionicons name="trophy" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.achievementText}>
                    <Text style={styles.achievementName}>{achievement.name}</Text>
                    <Text style={styles.achievementDescription} numberOfLines={2}>
                      {achievement.description}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </TailTagCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  centeredMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButton: {
    color: colors.primary,
    fontSize: 17,
  },
  profileHeader: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarContainer: {
    marginBottom: spacing.xs,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(30,41,59,0.8)',
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(30,41,59,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  bio: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 120,
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148,163,184,0.2)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  statValue: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
  },
  socialList: {
    gap: spacing.sm,
  },
  socialLink: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  socialLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  socialUrl: {
    color: '#38bdf8',
    fontSize: 13,
  },
  suitsList: {
    gap: spacing.md,
  },
  achievementList: {
    gap: spacing.sm,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  achievementIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(30,41,59,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  achievementText: {
    flex: 1,
    gap: 2,
  },
  achievementName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  achievementDescription: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
    lineHeight: 18,
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
});
