import { StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "./app-shell";

export function FeaturePlaceholder({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  const theme = useAppTheme();

  return (
    <View style={styles.page}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Text style={[styles.eyebrow, { color: theme.accentStrong }]}>
          {eyebrow}
        </Text>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.textMuted }]}>
          {description}
        </Text>
        <View
          style={[styles.status, { backgroundColor: theme.shouldSoft }]}
        >
          <Text style={[styles.statusText, { color: theme.should }]}>
            Foundation ready - feature implementation follows
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 620,
    padding: 30,
    width: "100%",
  },
  eyebrow: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 10,
    letterSpacing: 1.8,
    marginBottom: 10,
  },
  title: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 30,
    letterSpacing: -1,
  },
  description: {
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  status: {
    alignSelf: "flex-start",
    borderRadius: 18,
    marginTop: 24,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  statusText: {
    fontFamily: "Manrope_700Bold",
    fontSize: 10,
  },
});
