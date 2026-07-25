import { type PropsWithChildren, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { AccessiblePressable as Pressable } from "../accessibility/accessible-pressable";
import { darkTheme, lightTheme } from "../theme";
import { useAppLock } from "./app-lock-context";

export function AppLockBoundary({ children }: PropsWithChildren) {
  const appLock = useAppLock();
  const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;
  const styles = createStyles(theme);
  const [unlocking, setUnlocking] = useState(false);

  if (appLock.loading) {
    return (
      <View
        accessibilityLabel="Opening app lock"
        role="main"
        style={styles.page}
      >
        <ActivityIndicator color={theme.accentStrong} />
        <Text role="status" style={styles.visuallyHidden}>
          Checking app lock...
        </Text>
      </View>
    );
  }
  if (!appLock.locked) return children;

  async function unlock() {
    setUnlocking(true);
    try {
      await appLock.unlock();
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <View role="main" style={styles.page}>
      <View aria-hidden={true} style={styles.mark}>
        <View style={styles.markLine} />
        <View style={styles.markLine} />
        <View style={styles.markLine} />
      </View>
      <Text role="heading" style={styles.title}>
        Organa is locked
      </Text>
      <Text style={styles.body}>
        Use your device authentication to return to your private space.
      </Text>
      <Pressable
        accessibilityLabel="Unlock Organa"
        accessibilityRole="button"
        disabled={unlocking}
        style={styles.button}
        onPress={() => void unlock()}
      >
        {unlocking ? (
          <ActivityIndicator color={theme.surface} />
        ) : (
          <Text style={styles.buttonText}>Unlock</Text>
        )}
      </Pressable>
      {appLock.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {appLock.error}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: typeof lightTheme) {
  return StyleSheet.create({
    body: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 13,
      lineHeight: 20,
      marginTop: 9,
      maxWidth: 360,
      textAlign: "center",
    },
    button: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 14,
      justifyContent: "center",
      marginTop: 24,
      minHeight: 48,
      minWidth: 150,
    },
    buttonText: {
      color: theme.surface,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 12,
    },
    error: {
      color: theme.must,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
      marginTop: 14,
    },
    mark: { gap: 4, marginBottom: 20, width: 34 },
    markLine: {
      backgroundColor: theme.accentStrong,
      borderRadius: 4,
      height: 6,
    },
    page: {
      alignItems: "center",
      backgroundColor: theme.background,
      flex: 1,
      justifyContent: "center",
      padding: 24,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 30,
      letterSpacing: -1,
    },
    visuallyHidden: {
      height: 1,
      opacity: 0,
      position: "absolute",
      width: 1,
    },
  });
}
