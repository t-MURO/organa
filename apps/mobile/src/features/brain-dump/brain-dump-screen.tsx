import {
  searchBrainDumpBullets,
  type BrainDumpBullet,
} from "@organa/domain";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { TextInput as NativeTextInput } from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useAppTheme } from "../../components/app-shell";
import { KeyboardAwareScrollView } from "../../components/keyboard";
import { TextInput } from "../../components/themed-text-input";
import type { OrganaTheme } from "../../theme";
import { StyleSheet } from "../../typography";
import { useBrainDump } from "./brain-dump-context";

export function BrainDumpScreen() {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const { loading, bullets, addBullet, updateBullet, removeBullet } =
    useBrainDump();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [pendingFocusId, setPendingFocusId] = useState<string>();
  const inputRefs = useRef(new Map<string, NativeTextInput | null>());
  const visibleBullets = searchBrainDumpBullets(bullets, query);
  const isCompact = width < 680;

  useEffect(() => {
    if (!pendingFocusId) return;

    const input = inputRefs.current.get(pendingFocusId);
    if (input) {
      input.focus();
      setPendingFocusId(undefined);
    }
  }, [bullets, pendingFocusId]);

  function captureDraft() {
    if (!draft.trim()) return;

    addBullet(draft.trim());
    setDraft("");
  }

  function createNextBullet(afterId: string) {
    const id = addBullet("", afterId);
    setQuery("");
    setPendingFocusId(id);
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accentStrong} />
        <Text role="status" style={styles.loadingText}>
          Opening a quiet page...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={[
        styles.page,
        isCompact ? styles.pageCompact : undefined,
      ]}
    >
      <View
        style={[styles.hero, isCompact ? styles.heroCompact : undefined]}
      >
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>BRAIN DUMP</Text>
          <Text role="heading" style={styles.title}>
            Put it somewhere safe.
          </Text>
          <Text style={styles.subtitle}>
            Loose thoughts belong here. They do not need to become tasks.
          </Text>
        </View>
        <View style={styles.countCard}>
          <Text style={styles.countNumber}>{bullets.length}</Text>
          <Text style={styles.countLabel}>
            {bullets.length === 1 ? "thought" : "thoughts"}
          </Text>
        </View>
      </View>

      <View style={styles.captureCard}>
        <View style={styles.captureHeading}>
          <View>
            <Text style={styles.cardEyebrow}>QUICK CAPTURE</Text>
            <Text style={styles.cardTitle}>What is taking up space?</Text>
          </View>
          {!isCompact ? (
            <Text style={styles.keyboardHint}>Enter saves a bullet</Text>
          ) : null}
        </View>
        <View
          style={[
            styles.captureRow,
            isCompact ? styles.captureRowCompact : undefined,
          ]}
        >
          <View style={styles.captureInputWrap}>
            <View style={styles.captureDot} />
            <TextInput
              accessibilityLabel="New Brain Dump bullet"
              enterKeyHint="done"
              placeholder="Write one thought..."
              placeholderTextColor={theme.textMuted}
              returnKeyType="done"
              style={styles.captureInput}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={captureDraft}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.addButton,
              isCompact ? styles.addButtonCompact : undefined,
              pressed ? styles.buttonPressed : undefined,
            ]}
            onPress={captureDraft}
          >
            <Text style={styles.addButtonText}>Add bullet</Text>
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.noteHeading,
          isCompact ? styles.noteHeadingCompact : undefined,
        ]}
      >
        <View>
          <Text style={styles.cardEyebrow}>CONTINUOUS NOTE</Text>
          <Text style={styles.noteTitle}>Everything in one place</Text>
        </View>
        <View
          style={[
            styles.searchWrap,
            isCompact ? styles.searchWrapCompact : undefined,
          ]}
        >
          <TextInput
            accessibilityLabel="Search Brain Dump"
            placeholder="Search thoughts..."
            placeholderTextColor={theme.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear Brain Dump search"
              style={styles.clearSearch}
              onPress={() => setQuery("")}
            >
              <Text style={styles.clearSearchText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.noteCard}>
        {visibleBullets.length > 0 ? (
          visibleBullets.map((bullet, index) => (
            <BulletEditor
              key={bullet.id}
              bullet={bullet}
              isLast={index === visibleBullets.length - 1}
              styles={styles}
              theme={theme}
              setInputRef={(input) => {
                inputRefs.current.set(bullet.id, input);
              }}
              onChange={(text) => updateBullet(bullet, text)}
              onCreateNext={() => createNextBullet(bullet.id)}
              onRemove={() => removeBullet(bullet.id)}
            />
          ))
        ) : query ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No matching thoughts</Text>
            <Text style={styles.emptyText}>
              Nothing here uses “{query}”. Your other bullets are still safe.
            </Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyGlyph}>
              <View style={styles.emptyGlyphDot} />
              <View style={styles.emptyGlyphLine} />
            </View>
            <Text style={styles.emptyTitle}>A blank page, without pressure</Text>
            <Text style={styles.emptyText}>
              Add anything you want to remember, release, or revisit later.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footerNote}>
        <View style={styles.savedDot} />
        <Text style={styles.footerText}>
          Changes save automatically on this device
        </Text>
      </View>
    </KeyboardAwareScrollView>
  );
}

function BulletEditor({
  bullet,
  isLast,
  styles,
  theme,
  setInputRef,
  onChange,
  onCreateNext,
  onRemove,
}: {
  bullet: BrainDumpBullet;
  isLast: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: OrganaTheme;
  setInputRef(input: NativeTextInput | null): void;
  onChange(text: string): void;
  onCreateNext(): void;
  onRemove(): void;
}) {
  return (
    <View style={[styles.bulletRow, isLast ? styles.bulletRowLast : undefined]}>
      <View style={styles.bulletDot} />
      <TextInput
        ref={setInputRef}
        accessibilityLabel="Brain Dump bullet"
        multiline
        placeholder="Keep going..."
        placeholderTextColor={theme.textMuted}
        returnKeyType="next"
        scrollEnabled={false}
        submitBehavior="submit"
        style={styles.bulletInput}
        value={bullet.text}
        onChangeText={onChange}
        onKeyPress={(event) => {
          if (Platform.OS === "web" && event.nativeEvent.key === "Enter") {
            event.preventDefault();
            onCreateNext();
          }
        }}
        onSubmitEditing={
          Platform.OS === "web" ? undefined : onCreateNext
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove bullet ${bullet.text || "empty bullet"}`}
        style={({ pressed }) => [
          styles.removeButton,
          pressed ? styles.buttonPressed : undefined,
        ]}
        onPress={onRemove}
      >
        <Text style={styles.removeButtonText}>Remove</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    loading: {
      alignItems: "center",
      flex: 1,
      gap: 12,
      justifyContent: "center",
    },
    loadingText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 13,
    },
    page: {
      alignSelf: "center",
      maxWidth: 1480,
      paddingBottom: 60,
      paddingHorizontal: 28,
      paddingTop: 36,
      width: "100%",
    },
    pageCompact: {
      paddingHorizontal: 16,
      paddingTop: 22,
    },
    hero: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 24,
      justifyContent: "space-between",
      marginBottom: 28,
    },
    heroCompact: {
      alignItems: "stretch",
      flexDirection: "column",
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
      letterSpacing: 1.8,
      marginBottom: 9,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 34,
      letterSpacing: -1.4,
      lineHeight: 41,
    },
    subtitle: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
      maxWidth: 540,
    },
    countCard: {
      alignItems: "center",
      backgroundColor: theme.shouldSoft,
      borderRadius: 18,
      minWidth: 98,
      paddingHorizontal: 17,
      paddingVertical: 13,
    },
    countNumber: {
      color: theme.should,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 24,
    },
    countLabel: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
    },
    captureCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 22,
      borderWidth: 1,
      padding: 20,
    },
    captureHeading: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    cardEyebrow: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.5,
      marginBottom: 4,
    },
    cardTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 15,
    },
    keyboardHint: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 10,
    },
    captureRow: {
      flexDirection: "row",
      gap: 10,
    },
    captureRowCompact: {
      flexDirection: "column",
    },
    captureInputWrap: {
      alignItems: "center",
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      minHeight: 50,
      paddingHorizontal: 15,
    },
    captureDot: {
      backgroundColor: theme.accent,
      borderRadius: 5,
      height: 9,
      marginRight: 11,
      width: 9,
    },
    captureInput: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 13,
      minWidth: 0,
      paddingVertical: 12,
    },
    addButton: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 50,
      paddingHorizontal: 20,
    },
    addButtonText: {
      color: theme.background,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
    },
    addButtonCompact: {
      alignSelf: "stretch",
    },
    buttonPressed: {
      opacity: 0.68,
    },
    noteHeading: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 20,
      justifyContent: "space-between",
      marginBottom: 13,
      marginTop: 38,
    },
    noteHeadingCompact: {
      alignItems: "stretch",
      flexDirection: "column",
    },
    noteTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 20,
      letterSpacing: -0.6,
    },
    searchWrap: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 13,
      borderWidth: 1,
      flexDirection: "row",
      minWidth: 250,
    },
    searchWrapCompact: {
      minWidth: 0,
      width: "100%",
    },
    searchInput: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
      minHeight: 42,
      paddingHorizontal: 13,
    },
    clearSearch: {
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    clearSearchText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    noteCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 22,
      borderWidth: 1,
      overflow: "hidden",
    },
    bulletRow: {
      alignItems: "flex-start",
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 62,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    bulletRowLast: {
      borderBottomWidth: 0,
    },
    bulletDot: {
      backgroundColor: theme.accent,
      borderRadius: 5,
      height: 9,
      marginTop: 13,
      width: 9,
    },
    bulletInput: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 13,
      lineHeight: 20,
      minHeight: 38,
      minWidth: 0,
      paddingVertical: 8,
    },
    removeButton: {
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      marginTop: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    removeButtonText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    emptyState: {
      alignItems: "center",
      paddingHorizontal: 24,
      paddingVertical: 52,
    },
    emptyGlyph: {
      alignItems: "center",
      flexDirection: "row",
      marginBottom: 16,
    },
    emptyGlyphDot: {
      backgroundColor: theme.accent,
      borderRadius: 6,
      height: 11,
      marginRight: 9,
      width: 11,
    },
    emptyGlyphLine: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 6,
      height: 9,
      width: 80,
    },
    emptyTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 14,
      textAlign: "center",
    },
    emptyText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 11,
      lineHeight: 18,
      marginTop: 6,
      maxWidth: 390,
      textAlign: "center",
    },
    footerNote: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      marginTop: 18,
    },
    savedDot: {
      backgroundColor: theme.should,
      borderRadius: 4,
      height: 7,
      width: 7,
    },
    footerText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 10,
    },
  });
}
