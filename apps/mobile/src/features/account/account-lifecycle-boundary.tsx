import {
  type PropsWithChildren,
  useEffect,
  useRef,
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
  const [error, setError] = useState("");
  const finalizing = useRef(false);
  const deletionRequest = lifecycle.deletionRequest;
  const executeAt = deletionRequest
    ? new Date(deletionRequest.executeAfter).getTime()
    : Number.POSITIVE_INFINITY;
  const cancellable = !deletionRequest || now < executeAt;
  const seconds = Math.max(0, Math.ceil((executeAt - now) / 1_000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!deletionRequest || cancellable || finalizing.current) return;
    finalizing.current = true;
    void lifecycle.finalizeLocalDeletion().catch((nextError) => {
      finalizing.current = false;
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Local account data could not be cleared.",
      );
    });
  }, [cancellable, deletionRequest, lifecycle]);

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

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>ACCOUNT DELETION</Text>
        <Text style={styles.title}>
          {cancellable ? "Your account is read-only." : "Deletion is due now."}
        </Text>
        <Text style={styles.body}>
          {cancellable
            ? "Nothing can be changed while the cancellation window is open. Your encrypted cloud data and account will be permanently removed when the timer ends."
            : "The server is finalizing the request. Keep this screen open or return later to confirm that sign-in has ended."}
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
