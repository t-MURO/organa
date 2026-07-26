import { useRouter } from "expo-router";
import { Text, useWindowDimensions, View } from "react-native";

import { AccessiblePressable as Pressable } from "../accessibility/accessible-pressable";
import { useAppTheme } from "../components/app-shell";
import type { OrganaTheme } from "../theme";
import { StyleSheet } from "../typography";

export default function NotFoundScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();

  return (
    <View
      accessibilityLabel="Page not found"
      style={[styles.page, width < 620 ? styles.pageCompact : undefined]}
    >
      <View aria-hidden={true} style={styles.mark}>
        <View style={styles.markLine} />
        <View style={styles.markLine} />
        <View style={styles.markLine} />
      </View>
      <Text style={styles.eyebrow}>A QUIET DETOUR</Text>
      <Text role="heading" style={styles.title}>
        That page is not here.
      </Text>
      <Text style={styles.body}>
        The link may be old, but your saved space has not been changed.
      </Text>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          pressed ? styles.buttonPressed : undefined,
        ]}
        onPress={() => router.replace("/")}
      >
        <Text style={styles.buttonText}>Return to today</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    body: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 15,
      lineHeight: 23,
      marginTop: 12,
      maxWidth: 460,
      textAlign: "center",
    },
    button: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 14,
      justifyContent: "center",
      marginTop: 28,
      minHeight: 48,
      paddingHorizontal: 24,
    },
    buttonPressed: {
      opacity: 0.82,
    },
    buttonText: {
      color: theme.surface,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 12,
    },
    eyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.7,
      marginTop: 24,
    },
    mark: {
      gap: 4,
      width: 34,
    },
    markLine: {
      backgroundColor: theme.accentStrong,
      borderRadius: 4,
      height: 6,
    },
    page: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 48,
    },
    pageCompact: {
      padding: 24,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 38,
      letterSpacing: -1.4,
      lineHeight: 44,
      marginTop: 10,
      textAlign: "center",
    },
  });
}
