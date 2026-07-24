import {
  type PropsWithChildren,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { darkTheme, lightTheme } from "../../theme";
import { useAccountLifecycle } from "./account-lifecycle-context";

export function AccountLifecycleBoundary({ children }: PropsWithChildren) {
  const lifecycle = useAccountLifecycle();
  const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;
  const styles = createStyles(theme);
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const deletionRequest = lifecycle.deletionRequest;
  const executeAt = deletionRequest
    ? new Date(deletionRequest.executeAfter).getTime()
    : Number.POSITIVE_INFINITY;
  const cancellable = Boolean(
    deletionRequest &&
      (deletionRequest.due === false ||
        (deletionRequest.due === null && now < executeAt)),
  );
  const confirmationPending = Boolean(
    deletionRequest &&
      deletionRequest.due === null &&
      now >= executeAt,
  );
  const seconds = Math.max(0, Math.ceil((executeAt - now) / 1_000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  if (lifecycle.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accentStrong} />
        <Text style={styles.status}>Checking account status...</Text>
      </View>
    );
  }

  if (!deletionRequest) return children;

  async function cancel() {
    setCancelling(true);
    setError("");
    try {
      await lifecycle.cancelDeletion();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Deletion could not be cancelled.",
      );
      setCancelling(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      await lifecycle.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Deletion status could not be confirmed.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>ACCOUNT DELETION</Text>
        <Text style={styles.title}>
          {cancellable
            ? "Your account is read-only."
            : confirmationPending
              ? "Confirming deletion status."
              : "Deletion is being finalized."}
        </Text>
        <Text style={styles.body}>
          {cancellable
            ? "Nothing can be changed while the cancellation window is open. Your encrypted cloud data and account will be permanently removed when the timer ends."
            : confirmationPending
              ? "Reconnect before Organa clears this device. This protects your local data if the request was cancelled from another trusted device."
              : "The cancellation window is closed. Organa will clear this device only after the server confirms that cloud data and the account are gone."}
        </Text>
        {cancellable ? (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.timer}>
              {formatDuration(seconds)} remaining
            </Text>
            <Pressable
              accessibilityLabel="Cancel account deletion"
              accessibilityRole="button"
              disabled={cancelling}
              style={styles.cancelButton}
              onPress={() => void cancel()}
            >
              {cancelling ? (
                <ActivityIndicator color={theme.surface} />
              ) : (
                <Text style={styles.cancelText}>Cancel deletion</Text>
              )}
            </Pressable>
          </>
        ) : confirmationPending ? (
          <Pressable
            accessibilityLabel="Check account deletion status"
            accessibilityRole="button"
            disabled={refreshing}
            style={styles.cancelButton}
            onPress={() => void refresh()}
          >
            {refreshing ? (
              <ActivityIndicator color={theme.surface} />
            ) : (
              <Text style={styles.cancelText}>Check status</Text>
            )}
          </Pressable>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}

function createStyles(theme: typeof lightTheme) {
  return StyleSheet.create({
    body: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 14,
      lineHeight: 22,
      marginTop: 12,
    },
    cancelButton: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 14,
      justifyContent: "center",
      marginTop: 24,
      minHeight: 48,
    },
    cancelText: {
      color: theme.surface,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 12,
    },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 24,
      borderWidth: 1,
      maxWidth: 560,
      padding: 30,
      width: "100%",
    },
    center: {
      alignItems: "center",
      backgroundColor: theme.background,
      flex: 1,
      gap: 12,
      justifyContent: "center",
    },
    error: {
      color: theme.must,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
      marginTop: 14,
    },
    eyebrow: {
      color: theme.must,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.6,
    },
    page: {
      alignItems: "center",
      backgroundColor: theme.background,
      flex: 1,
      justifyContent: "center",
      padding: 20,
    },
    status: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
    },
    timer: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 32,
      letterSpacing: -1,
      marginTop: 22,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 30,
      letterSpacing: -1,
      marginTop: 8,
    },
  });
}
