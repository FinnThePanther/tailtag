import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import {
  FursuitCard,
  FursuitBioDetails,
  CAUGHT_SUITS_QUERY_KEY,
  mapLatestFursuitBio,
  mapFursuitColors,
  fursuitDetailQueryKey,
} from "../../src/features/suits";
import type { FursuitBio } from "../../src/features/suits";
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
} from "../../src/features/leaderboard";
import { TailTagButton } from "../../src/components/ui/TailTagButton";
import { TailTagCard } from "../../src/components/ui/TailTagCard";
import { TailTagInput } from "../../src/components/ui/TailTagInput";
import { useAuth } from "../../src/features/auth";
import { emitGameplayEvent } from "../../src/features/events";
import { DAILY_TASKS_QUERY_KEY } from "../../src/features/daily-tasks/hooks";
import { supabase } from "../../src/lib/supabase";
import { colors, spacing } from "../../src/theme";
import { normalizeUniqueCodeInput } from "../../src/utils/code";
import { toDisplayDateTime } from "../../src/utils/dates";

import type { FursuitsRow } from "../../src/types/database";
import type { FursuitColorOption } from "../../src/features/colors";

type FursuitDetails = Pick<
  FursuitsRow,
  | "id"
  | "name"
  | "species"
  | "species_id"
  | "avatar_url"
  | "unique_code"
  | "owner_id"
  | "is_tutorial"
  | "catch_count"
> & { created_at: string | null; bio: FursuitBio | null; colors: FursuitColorOption[] };

type CatchRecord = {
  id: string;
  caught_at: string | null;
  catch_number: number | null;
};

export default function CatchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();

  const [codeInput, setCodeInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [caughtFursuit, setCaughtFursuit] = useState<FursuitDetails | null>(
    null
  );
  const [catchRecord, setCatchRecord] = useState<CatchRecord | null>(null);
  const [catchNumber, setCatchNumber] = useState<number | null>(null);
  const [conversationPrompt, setConversationPrompt] = useState<string | null>(
    null
  );

  const resetCatchState = () => {
    setCaughtFursuit(null);
    setCatchRecord(null);
    setCatchNumber(null);
    setConversationPrompt(null);
  };

  const handleSubmit = async () => {
    if (!userId || isSubmitting) {
      return;
    }

    const normalizedCode = normalizeUniqueCodeInput(codeInput);

    if (!normalizedCode) {
      setSubmitError(
        "Enter the code from the fursuit badge to record your catch."
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    resetCatchState();

    try {
      const client = supabase as any;

      const { data: fursuit, error: fursuitError } = await client
        .from("fursuits")
        .select(
          `
          id,
          name,
          species,
          species_id,
          avatar_url,
          is_tutorial,
          unique_code,
          catch_count,
          owner_id,
          created_at,
          species_entry:fursuit_species (
            id,
            name,
            normalized_name
          ),
          color_assignments:fursuit_color_assignments (
            position,
            color:fursuit_colors (
              id,
              name,
              normalized_name
            )
          ),
          fursuit_bios (
            version,
            fursuit_name,
            fursuit_species,
            owner_name,
            pronouns,
            tagline,
            fun_fact,
            likes_and_interests,
            ask_me_about,
            social_links,
            created_at,
            updated_at
          )
        `
        )
        .eq("unique_code", normalizedCode)
        .order("version", { ascending: false, foreignTable: "fursuit_bios" })
        .limit(1, { foreignTable: "fursuit_bios" })
        .eq("is_tutorial", false)
        .maybeSingle();

      if (fursuitError) {
        throw fursuitError;
      }

      if (!fursuit) {
        resetCatchState();
        setSubmitError(
          "We couldn't find a fursuit with that code. Double-check the letters and try again."
        );
        return;
      }

      const initialCatchCount =
        typeof (fursuit as any)?.catch_count === "number"
          ? (fursuit as any).catch_count
          : 0;

      const normalizedFursuit: FursuitDetails = {
        id: fursuit.id,
        name: fursuit.name,
        species:
          (fursuit as any)?.species_entry?.name ?? fursuit.species ?? null,
        species_id:
          (fursuit as any)?.species_entry?.id ?? fursuit.species_id ?? null,
        avatar_url: fursuit.avatar_url ?? null,
        unique_code: fursuit.unique_code ?? null,
        catch_count: initialCatchCount,
        owner_id: fursuit.owner_id,
        created_at: fursuit.created_at ?? null,
        bio: mapLatestFursuitBio((fursuit as any)?.fursuit_bios ?? null),
        colors: mapFursuitColors((fursuit as any)?.color_assignments ?? null),
        is_tutorial: fursuit.is_tutorial === true,
      };

      if (normalizedFursuit.is_tutorial) {
        resetCatchState();
        setSubmitError("Tutorial suits cannot be caught by scanning codes.");
        return;
      }

      if (normalizedFursuit.owner_id === userId) {
        resetCatchState();
        setSubmitError(
          "That tag belongs to one of your own suits. Trade codes with friends to grow your collection."
        );
        return;
      }

      const { data: suitConventionRows, error: suitConventionError } =
        await client
          .from("fursuit_conventions")
          .select("convention_id")
          .eq("fursuit_id", normalizedFursuit.id);

      if (suitConventionError) {
        throw suitConventionError;
      }

      const { data: playerConventionRows, error: playerConventionError } =
        await client
          .from("profile_conventions")
          .select("convention_id")
          .eq("profile_id", userId);

      if (playerConventionError) {
        throw playerConventionError;
      }

      const suitConventionIds = new Set<string>(
        (suitConventionRows ?? []).map(
          (row: { convention_id: string }) => row.convention_id
        )
      );
      const playerConventionIds = new Set<string>(
        (playerConventionRows ?? []).map(
          (row: { convention_id: string }) => row.convention_id
        )
      );

      if (playerConventionIds.size === 0) {
        resetCatchState();
        setSubmitError(
          "Opt into at least one convention in Settings before logging catches."
        );
        return;
      }

      if (suitConventionIds.size === 0) {
        resetCatchState();
        setSubmitError(
          "This suit has not opted into any conventions yet. Ask the owner to update their settings before logging the catch."
        );
        return;
      }

      const sharedConventions: string[] = [...playerConventionIds]
        .filter((id) => suitConventionIds.has(id))
        .sort();
      const primaryConventionId = sharedConventions[0] ?? null;

      if (sharedConventions.length === 0) {
        resetCatchState();
        setSubmitError(
          "You and this suit need to opt into the same convention before logging the catch."
        );
        return;
      }

      const { data: existingCatch, error: existingCatchError } = await client
        .from("catches")
        .select("id")
        .eq("fursuit_id", normalizedFursuit.id)
        .eq("catcher_id", userId)
        .maybeSingle();

      if (existingCatchError) {
        throw existingCatchError;
      }

      if (existingCatch) {
        resetCatchState();
        setSubmitError(
          "You already caught this suit. Swap codes with another fursuiter to keep hunting."
        );
        return;
      }

      const { data: insertedCatch, error: catchError } = await client
        .from("catches")
        .insert({
          fursuit_id: normalizedFursuit.id,
          catcher_id: userId,
          convention_id: primaryConventionId,
          is_tutorial: Boolean(normalizedFursuit.is_tutorial),
        })
        .select("id, caught_at, catch_number")
        .single();

      if (catchError) {
        if (catchError.code === "23505") {
          setSubmitError(
            "You already caught this suit. Swap codes with another fursuiter to keep hunting."
          );
          resetCatchState();
          return;
        }

        throw catchError;
      }

      const promptCandidate = normalizedFursuit.bio
        ? [
            normalizedFursuit.bio.askMeAbout,
            normalizedFursuit.bio.tagline,
            normalizedFursuit.bio.funFact,
            normalizedFursuit.bio.likesAndInterests,
          ]
            .map((value) => value?.trim())
            .find((value) => value)
        : null;

      const minimumCatchCount = initialCatchCount + 1;
      let latestCatchCount = minimumCatchCount;

      try {
        const { data: latestFursuit, error: latestCatchError } = await client
          .from("fursuits")
          .select("catch_count")
          .eq("id", normalizedFursuit.id)
          .maybeSingle();

        if (latestCatchError) {
          throw latestCatchError;
        }

        if (latestFursuit && typeof latestFursuit.catch_count === "number") {
          latestCatchCount = Math.max(
            latestFursuit.catch_count,
            minimumCatchCount
          );
        }
      } catch (countError) {
        console.warn("Failed to refresh catch count", countError);
      }

      const normalizedCatchRecord: CatchRecord | null = insertedCatch
        ? {
            id: insertedCatch.id,
            caught_at: insertedCatch.caught_at ?? null,
            catch_number:
              typeof insertedCatch.catch_number === "number"
                ? insertedCatch.catch_number
                : null,
          }
        : null;

      setCaughtFursuit({
        ...normalizedFursuit,
        catch_count: latestCatchCount,
      });
      setCatchRecord(normalizedCatchRecord);
      setCatchNumber(
        normalizedCatchRecord?.catch_number ?? latestCatchCount
      );
      setConversationPrompt(promptCandidate ?? null);
      await emitGameplayEvent({
        type: "catch_performed",
        conventionId: primaryConventionId,
        payload: {
          fursuit_id: normalizedFursuit.id,
          catch_id: normalizedCatchRecord?.id ?? null,
          catch_number: normalizedCatchRecord?.catch_number ?? null,
          convention_ids: sharedConventions,
          is_tutorial: Boolean(normalizedFursuit.is_tutorial),
        },
        occurredAt: normalizedCatchRecord?.caught_at ?? new Date().toISOString(),
      });
      void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: fursuitDetailQueryKey(normalizedFursuit.id),
      });
      sharedConventions.forEach((conventionId) => {
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
        });
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, conventionId],
        });
      });
      queryClient.invalidateQueries({
        queryKey: [CAUGHT_SUITS_QUERY_KEY, userId],
      });
      setCodeInput("");
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We couldn't save that catch. Please try again.";
      setSubmitError(fallbackMessage);
      resetCatchState();
    } finally {
      setIsSubmitting(false);
    }
  };

  const caughtAtLabel = catchRecord
    ? toDisplayDateTime(catchRecord.caught_at) ?? "Caught just now"
    : null;

  const handleCatchAnother = () => {
    resetCatchState();
    setSubmitError(null);
    setCodeInput("");
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Tag Fursuits Here</Text>
          <Text style={styles.title}>Log a new catch</Text>
          <Text style={styles.subtitle}>
            Enter the eight-letter code from a friend&apos;s tail tag to add
            them to your collection.
          </Text>
        </View>

        <TailTagCard style={styles.cardSpacing}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Catch code</Text>
            <TailTagInput
              value={codeInput}
              onChangeText={(value) => {
                setCodeInput(normalizeUniqueCodeInput(value));
                setSubmitError(null);
              }}
              placeholder="ABCDEFGH"
              autoCapitalize="characters"
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              style={styles.codeInput}
            />
            <Text style={styles.helpText}>
              Letters only, up to 8 characters.
            </Text>
          </View>

          {submitError ? (
            <Text style={styles.errorText}>{submitError}</Text>
          ) : null}

          <TailTagButton
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!userId || isSubmitting}
          >
            Record catch
          </TailTagButton>
        </TailTagCard>

        {caughtFursuit ? (
          <TailTagCard style={styles.cardSpacing}>
            <Text style={styles.sectionTitle}>Nice catch!</Text>
            {catchNumber !== null ? (
              <Text style={[styles.sectionBody, styles.sectionHighlight]}>
                You were catcher #{catchNumber} for this suit!
              </Text>
            ) : null}
            <Text style={styles.sectionBody}>
              You just tagged {caughtFursuit.name}. Scroll through their bio
              below and trade codes to keep your streak growing.
            </Text>
            {conversationPrompt ? (
              <TailTagCard style={styles.promptCard}>
                <Text style={styles.promptLabel}>Ask them about…</Text>
                <Text style={styles.promptBody}>{conversationPrompt}</Text>
              </TailTagCard>
            ) : null}
            <FursuitCard
              name={caughtFursuit.name}
              species={caughtFursuit.species}
              colors={caughtFursuit.colors}
              avatarUrl={caughtFursuit.avatar_url}
              uniqueCode={caughtFursuit.unique_code}
              timelineLabel={caughtAtLabel ?? undefined}
              onPress={() =>
                router.push({
                  pathname: "/fursuits/[id]",
                  params: { id: caughtFursuit.id },
                })
              }
            />
            {caughtFursuit.bio ? (
              <View style={styles.bioSpacing}>
                <FursuitBioDetails bio={caughtFursuit.bio} />
              </View>
            ) : null}
            <View style={styles.buttonRow}>
              <TailTagButton
                variant="outline"
                onPress={() => router.push("/caught")}
                style={styles.inlineButtonSpacing}
              >
                View catches
              </TailTagButton>
              <TailTagButton variant="ghost" onPress={handleCatchAnother}>
                Catch another suit
              </TailTagButton>
            </View>
          </TailTagCard>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: "uppercase",
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 26,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: "rgba(203,213,225,0.9)",
    fontSize: 15,
  },
  cardSpacing: {
    marginBottom: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  helpText: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 12,
    marginTop: spacing.xs,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  sectionBody: {
    color: "rgba(203,213,225,0.9)",
    fontSize: 14,
    marginBottom: spacing.md,
  },
  sectionHighlight: {
    color: colors.primary,
    fontWeight: "600",
  },
  bioSpacing: {
    marginTop: spacing.md,
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: spacing.md,
    alignItems: "center",
  },
  inlineButtonSpacing: {
    marginRight: spacing.md,
  },
  codeInput: {
    textTransform: "uppercase",
    letterSpacing: 4,
    fontSize: 20,
  },
  promptCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryDark,
  },
  promptLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: spacing.xs,
    fontWeight: "600",
  },
  promptBody: {
    fontSize: 16,
    color: colors.foreground,
    lineHeight: 22,
  },
});
