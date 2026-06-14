import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppImage } from '../../src/components/ui/AppImage';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { useToast } from '../../src/hooks/useToast';
import { useAuth } from '../../src/features/auth';
import {
  approveCatchInvite,
  claimCatchInvite,
  clearPendingCatchInviteToken,
  declineCatchInvite,
  reportCatchInvite,
  savePendingCatchInviteToken,
  type CatchInvite,
} from '../../src/features/catch-invites';
import { createMySuitsQueryOptions, mySuitsQueryKey } from '../../src/features/suits';
import { CAUGHT_COLLECTION_QUERY_KEY, CAUGHT_SUITS_QUERY_KEY } from '../../src/features/suits';
import { DAILY_TASKS_QUERY_KEY } from '../../src/features/daily-tasks/hooks';
import { achievementsStatusQueryKey } from '../../src/features/achievements';
import { colors } from '../../src/theme';
import { getUserVisibleErrorMessage } from '../../src/lib/userVisibleErrors';
import { captureHandledException } from '../../src/lib/sentry';
import { styles } from '../../src/app-styles/invite/[token].styles';

function normalizeTokenParam(value: string | string[] | undefined): string | null {
  const token = Array.isArray(value) ? value[0] : value;
  return token && /^[A-Za-z0-9_-]{32,160}$/.test(token) ? token : null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CatchInviteScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = normalizeTokenParam(params.token);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { showToast } = useToast();
  const [invite, setInvite] = useState<CatchInvite | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(true);
  const [selectedFursuitId, setSelectedFursuitId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<'approve' | 'decline' | 'report' | null>(null);

  const { data: mySuits = [], isLoading: isLoadingSuits } = useQuery({
    ...(userId
      ? createMySuitsQueryOptions(userId)
      : {
          queryKey: mySuitsQueryKey('guest'),
          queryFn: async () => [],
        }),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!token) {
      setClaimError('This invite link is not valid.');
      setIsClaiming(false);
      return;
    }

    void savePendingCatchInviteToken(token);
  }, [token]);

  useEffect(() => {
    if (!token || !userId) {
      return;
    }

    let isMounted = true;
    setIsClaiming(true);
    setClaimError(null);

    void claimCatchInvite(token)
      .then((nextInvite) => {
        if (!isMounted) return;
        setInvite(nextInvite);
        setSelectedFursuitId(nextInvite.selectedFursuitId);
      })
      .catch((caught) => {
        if (!isMounted) return;
        const message = getUserVisibleErrorMessage(
          caught,
          "We couldn't open this invite. Please ask the sender for a new link.",
        );
        setClaimError(message);
        captureHandledException(caught, { scope: 'catch-invites.claimScreen.claim', userId });
      })
      .finally(() => {
        if (isMounted) {
          setIsClaiming(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token, userId]);

  const selectedFursuit = useMemo(
    () => mySuits.find((suit) => suit.id === selectedFursuitId) ?? null,
    [mySuits, selectedFursuitId],
  );

  const caughtAtLabel = formatDate(invite?.caughtAt);
  const expiresAtLabel = formatDate(invite?.expiresAt);
  const isTerminal =
    invite?.status === 'APPROVED' ||
    invite?.status === 'DECLINED' ||
    invite?.status === 'REPORTED' ||
    invite?.status === 'EXPIRED' ||
    invite?.status === 'CANCELED' ||
    invite?.status === 'CANCELED_DUPLICATE';

  const handleApprove = async () => {
    if (!invite || !selectedFursuitId || activeAction) {
      return;
    }

    setActiveAction('approve');
    setActionError(null);
    try {
      const nextInvite = await approveCatchInvite({
        inviteId: invite.inviteId,
        fursuitId: selectedFursuitId,
      });
      setInvite(nextInvite);
      await clearPendingCatchInviteToken();
      showToast(
        nextInvite.creditScope === 'personal_only'
          ? 'Invite approved. This catch counts in personal collections.'
          : 'Invite approved. The catch now counts for both players.',
      );

      if (userId) {
        void queryClient.invalidateQueries({ queryKey: mySuitsQueryKey(userId) });
        void queryClient.invalidateQueries({ queryKey: [CAUGHT_SUITS_QUERY_KEY, userId] });
        void queryClient.invalidateQueries({ queryKey: [CAUGHT_COLLECTION_QUERY_KEY, userId] });
        void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
        void queryClient.invalidateQueries({ queryKey: achievementsStatusQueryKey(userId) });
      }
    } catch (caught) {
      setActionError(
        getUserVisibleErrorMessage(caught, "We couldn't approve this invite. Please try again."),
      );
      captureHandledException(caught, { scope: 'catch-invites.claimScreen.approve', userId });
    } finally {
      setActiveAction(null);
    }
  };

  const handleDecline = async () => {
    if (!invite || activeAction) {
      return;
    }

    setActiveAction('decline');
    setActionError(null);
    try {
      const nextInvite = await declineCatchInvite(invite.inviteId);
      setInvite(nextInvite);
      await clearPendingCatchInviteToken();
      showToast('Invite declined.');
    } catch (caught) {
      setActionError(
        getUserVisibleErrorMessage(caught, "We couldn't decline this invite. Please try again."),
      );
      captureHandledException(caught, { scope: 'catch-invites.claimScreen.decline', userId });
    } finally {
      setActiveAction(null);
    }
  };

  const handleReport = async () => {
    if (!invite || activeAction) {
      return;
    }

    setActiveAction('report');
    setActionError(null);
    try {
      const nextInvite = await reportCatchInvite({
        inviteId: invite.inviteId,
        reason: 'Reported from invite claim screen',
      });
      setInvite(nextInvite);
      await clearPendingCatchInviteToken();
      showToast('Invite reported for review.');
    } catch (caught) {
      setActionError(
        getUserVisibleErrorMessage(caught, "We couldn't report this invite. Please try again."),
      );
      captureHandledException(caught, { scope: 'catch-invites.claimScreen.report', userId });
    } finally {
      setActiveAction(null);
    }
  };

  if (!userId || isClaiming) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
          <Text style={styles.statusText}>Opening invite…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>TailTag Invite</Text>
          <Text style={styles.title}>Review invite catch</Text>
          <Text style={styles.subtitle}>
            Approve this only if the photo is you and the selected suit is correct.
          </Text>
        </View>

        {claimError ? (
          <TailTagCard style={styles.card}>
            <Text style={styles.errorTitle}>Invite unavailable</Text>
            <Text style={styles.body}>{claimError}</Text>
            <TailTagButton onPress={() => router.replace('/')}>Go home</TailTagButton>
          </TailTagCard>
        ) : invite ? (
          <>
            <TailTagCard style={styles.card}>
              <AppImage
                url={invite.catchPhotoUrl}
                width={720}
                height={520}
                style={styles.invitePhoto}
                accessibilityLabel="Invite catch photo"
              />
              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Tagged by</Text>
                  <Text style={styles.metaValue}>
                    {invite.inviterUsername ?? 'A TailTag player'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Convention</Text>
                  <Text style={styles.metaValue}>{invite.conventionName ?? 'TailTag event'}</Text>
                </View>
                {caughtAtLabel ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Caught at</Text>
                    <Text style={styles.metaValue}>{caughtAtLabel}</Text>
                  </View>
                ) : null}
                {expiresAtLabel ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Expires</Text>
                    <Text style={styles.metaValue}>{expiresAtLabel}</Text>
                  </View>
                ) : null}
              </View>
            </TailTagCard>

            {isTerminal ? (
              <TailTagCard style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {invite.status === 'APPROVED'
                    ? 'Invite approved'
                    : invite.status === 'DECLINED'
                      ? 'Invite declined'
                      : invite.status === 'REPORTED'
                        ? 'Invite reported'
                        : 'Invite closed'}
                </Text>
                <Text style={styles.body}>
                  {invite.status === 'APPROVED'
                    ? 'This invite catch has been processed.'
                    : 'No further action is needed for this invite.'}
                </Text>
                <TailTagButton onPress={() => router.replace('/')}>Done</TailTagButton>
              </TailTagCard>
            ) : (
              <TailTagCard style={styles.card}>
                <Text style={styles.sectionTitle}>Choose your suit</Text>
                <Text style={styles.body}>
                  The catch will count for the fursuit you select here.
                </Text>

                {isLoadingSuits ? (
                  <ActivityIndicator color={colors.primary} />
                ) : mySuits.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.body}>Add your fursuit before approving this catch.</Text>
                    <TailTagButton onPress={() => router.push('/suits/add-fursuit')}>
                      Add fursuit
                    </TailTagButton>
                  </View>
                ) : (
                  <View style={styles.suitList}>
                    {mySuits.map((suit) => {
                      const selected = selectedFursuitId === suit.id;
                      return (
                        <Pressable
                          key={suit.id}
                          onPress={() => setSelectedFursuitId(suit.id)}
                          style={[styles.suitRow, selected && styles.suitRowSelected]}
                          accessibilityRole="button"
                        >
                          <AppImage
                            url={suit.avatar_url}
                            width={48}
                            height={48}
                            style={styles.suitAvatar}
                          />
                          <View style={styles.suitTextBlock}>
                            <Text style={styles.suitName}>{suit.name}</Text>
                            <Text style={styles.suitSpecies}>{suit.species ?? 'Fursuit'}</Text>
                          </View>
                          {selected ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={22}
                              color={colors.primary}
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {actionError ? (
                  <Text style={styles.actionError}>{actionError}</Text>
                ) : selectedFursuit ? (
                  <Text style={styles.selectionText}>Approving as {selectedFursuit.name}</Text>
                ) : null}

                <View style={styles.actions}>
                  <TailTagButton
                    onPress={handleApprove}
                    disabled={!selectedFursuitId || Boolean(activeAction)}
                    loading={activeAction === 'approve'}
                  >
                    Approve catch
                  </TailTagButton>
                  <TailTagButton
                    variant="outline"
                    onPress={handleDecline}
                    disabled={Boolean(activeAction)}
                    loading={activeAction === 'decline'}
                  >
                    Decline
                  </TailTagButton>
                  <TailTagButton
                    variant="outline"
                    onPress={handleReport}
                    disabled={Boolean(activeAction)}
                    loading={activeAction === 'report'}
                  >
                    Report
                  </TailTagButton>
                </View>
              </TailTagCard>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
