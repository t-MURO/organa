import { useEffect, useReducer } from "react";
import {
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { darkTheme, lightTheme } from "../../theme";
import {
  activateWaitingPwaUpdate,
  hasWaitingPwaUpdate,
  initialPwaUpdatePromptState,
  reducePwaUpdatePrompt,
} from "./pwa-update-model";

export function PwaUpdateCoordinator() {
  const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;
  const styles = createStyles(theme);
  const [{ ready, restarting }, dispatch] = useReducer(
    reducePwaUpdatePrompt,
    initialPwaUpdatePromptState,
  );

  useEffect(() => {
    function show() {
      dispatch({ type: "available" });
    }

    window.addEventListener("organa:update-ready", show);
    void navigator.serviceWorker
      ?.getRegistration()
      .then((registration) => {
        if (
          hasWaitingPwaUpdate(
            registration,
            navigator.serviceWorker.controller,
          )
        ) {
          show();
        }
      })
      .catch(() => undefined);
    return () => window.removeEventListener("organa:update-ready", show);
  }, []);

  async function restart() {
    dispatch({ type: "restart" });
    await activateWaitingPwaUpdate(navigator.serviceWorker, {
      cancelTimer: (handle) => window.clearTimeout(handle as number),
      reload: () => window.location.reload(),
      scheduleTimer: (callback, delayMs) =>
        window.setTimeout(callback, delayMs),
    });
  }

  if (!ready) return null;

  return (
    <View accessibilityLiveRegion="polite" style={styles.positioner}>
      <View style={styles.card}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>UPDATE READY</Text>
          <Text style={styles.title}>A fresh version is ready.</Text>
          <Text style={styles.body}>
            Restart when it feels convenient. Your local changes are safe.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: restarting }}
          aria-disabled={restarting}
          disabled={restarting}
          style={styles.button}
          onPress={() => void restart()}
        >
          <Text style={styles.buttonText}>
            {restarting ? "Restarting..." : "Restart to update"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Dismiss update prompt"
          accessibilityRole="button"
          accessibilityState={{ disabled: restarting }}
          aria-disabled={restarting}
          disabled={restarting}
          style={styles.dismiss}
          onPress={() => dispatch({ type: "dismiss" })}
        >
          <Text style={styles.dismissText}>Later</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: typeof lightTheme) {
  return StyleSheet.create({
    body: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 11,
      marginTop: 2,
    },
    button: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 11,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 14,
    },
    buttonText: {
      color: theme.surface,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
    },
    card: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      boxShadow: `0 18px 50px ${theme.shadow}26`,
      flexDirection: "row",
      gap: 12,
      maxWidth: 680,
      padding: 14,
      width: "100%",
    },
    copy: { flex: 1 },
    dismiss: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 6,
    },
    dismissText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    eyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 1.2,
    },
    positioner: {
      alignItems: "center",
      bottom: 18,
      left: 0,
      paddingHorizontal: 16,
      pointerEvents: "box-none",
      position: "absolute",
      right: 0,
      zIndex: 200,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 13,
      marginTop: 2,
    },
  });
}
