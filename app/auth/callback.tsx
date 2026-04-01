import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import { completeOAuthSessionFromUrl } from "../../src/features/auth/utils/oauth";
import { colors } from "../../src/theme";
import { styles } from "../../src/app-styles/auth/callback.styles";

const formatErrorMessage = (input: unknown) =>
  input instanceof Error ? input.message : "Unable to finish signing in. Please try again.";

type StatusState = "loading" | "idle" | "error";

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const [status, setStatus] = useState<StatusState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const completeFromUrl = async (incomingUrl: string | null | undefined) => {
      if (!isMounted) {
        return;
      }

      if (!incomingUrl) {
        setStatus("idle");
        return;
      }

      setStatus("loading");

      try {
        const handled = await completeOAuthSessionFromUrl(incomingUrl);

        if (!isMounted) {
          return;
        }

        if (handled) {
          router.replace("/");
          return;
        }

        setStatus("error");
        setError("This link did not include a valid session. Try signing in again.");
      } catch (caught) {
        if (!isMounted) {
          return;
        }

        setStatus("error");
        setError(formatErrorMessage(caught));
      }
    };

    if (url) {
      void completeFromUrl(url);
    } else {
      void Linking.getInitialURL()
        .then((initialUrl) => {
          void completeFromUrl(initialUrl);
        })
        .catch((caught) => {
          console.error("[auth-callback] Failed to load initial URL", caught);
          void completeFromUrl(null);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [router, url]);

  const showError = status === "error" && error;

  return (
    <View style={styles.container}>
      {status === "loading" && (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.statusText}>Finishing up your sign-in…</Text>
        </>
      )}

      {status === "idle" && (
        <Text style={styles.statusText}>
          This page is used to finish social sign-ins. You can return to the login screen if you
          reached it accidentally.
        </Text>
      )}

      {showError ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}
