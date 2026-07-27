import {
  checkInTrend,
  formatLocalDate,
  searchCheckInEntries,
  type CheckInEntry,
  type MoodRating,
} from "@organa/domain";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useAppTheme } from "../../components/app-shell";
import { keyboardAwareScrollProps } from "../../components/keyboard";
import { TextInput } from "../../components/themed-text-input";
import { checkInReminderCapability } from "../../data/create-check-in-reminder-scheduler";
import type { OrganaTheme } from "../../theme";
import { StyleSheet } from "../../typography";
import { useSettings } from "../settings/settings-context";
import { useCheckIns } from "./check-in-context";

const moodOptions: Array<{
  value: MoodRating;
  label: string;
}> = [
  { value: 1, label: "Heavy" },
  { value: 2, label: "Low" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Bright" },
];

export function CheckInScreen() {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const { loading, entries, saveEntry } = useCheckIns();
  const { settings, update: updateSettings } = useSettings();
  const today = formatLocalDate(new Date());
  const todayEntry = entries.find((entry) => entry.date === today);
  const [mood, setMood] = useState<MoodRating>();
  const [feeling, setFeeling] = useState("");
  const [reflection, setReflection] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const editVersion = useRef(0);
  const [query, setQuery] = useState("");
  const [trendDays, setTrendDays] = useState<7 | 30>(7);
  const trend = checkInTrend(entries, today, trendDays);
  const visibleEntries = searchCheckInEntries(entries, query);
  const isWide = width >= 1120;
  const isCompact = width < 680;

  useEffect(() => {
    if (!todayEntry) return;

    setMood(todayEntry.mood);
    setFeeling(todayEntry.feeling ?? "");
    setReflection(todayEntry.reflection ?? "");
  }, [todayEntry?.id]);

  function markChanged() {
    editVersion.current += 1;
    setSaved(false);
    setSaveError("");
  }

  function selectMood(nextMood: MoodRating) {
    setMood(nextMood);
    markChanged();
  }

  function changeFeeling(value: string) {
    setFeeling(value.replace(/\s+/g, "").slice(0, 24));
    markChanged();
  }

  function changeReflection(value: string) {
    setReflection(value);
    markChanged();
  }

  async function submit() {
    if (!mood || saving) return;

    const submittedVersion = editVersion.current;
    setSaving(true);
    setSaveError("");
    try {
      await saveEntry({
        date: today,
        mood,
        feeling,
        reflection,
      });
      if (editVersion.current === submittedVersion) setSaved(true);
    } catch {
      setSaved(false);
      setSaveError(
        "This Check-In did not save safely. Your words are still here so you can try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accentStrong} />
        <Text role="status" style={styles.loadingText}>
          Making a little room...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      {...keyboardAwareScrollProps}
      contentContainerStyle={[
        styles.page,
        isCompact ? styles.pageCompact : undefined,
      ]}
    >
      <View
        style={[styles.hero, isCompact ? styles.heroCompact : undefined]}
      >
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>CHECK-IN</Text>
          <Text role="heading" style={styles.title}>
            A quiet moment, if you want it.
          </Text>
          <Text style={styles.subtitle}>
            Notice how today feels. A number is enough; words are optional.
          </Text>
        </View>
        <View style={styles.optionalPill}>
          <Text style={styles.optionalPillText}>Always optional</Text>
        </View>
      </View>

      <View style={styles.reminderCard}>
        <View style={styles.reminderCopy}>
          <Text style={styles.cardEyebrow}>OPTIONAL EVENING REMINDER</Text>
          <Text style={styles.reminderTitle}>A gentle nudge, only if useful.</Text>
          <Text style={styles.reminderText}>
            {checkInReminderCapability.reason ??
              "Scheduled privately on this device and kept separate from task reminders."}
          </Text>
        </View>
        <View style={styles.reminderControls}>
          <View style={styles.timeChips}>
            {["18:00", "19:00", "20:00", "21:00", "22:00"].map(
              (time) => (
                <Pressable
                  key={time}
                  accessibilityLabel={`Set Check-In reminder for ${time}`}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: settings.checkInReminder.time === time,
                  }}
                  aria-checked={settings.checkInReminder.time === time}
                  disabled={!settings.checkInReminder.enabled}
                  style={[
                    styles.timeChip,
                    settings.checkInReminder.time === time
                      ? styles.timeChipActive
                      : undefined,
                    !settings.checkInReminder.enabled
                      ? styles.timeChipDisabled
                      : undefined,
                  ]}
                  onPress={() =>
                    updateSettings({
                      checkInReminder: { enabled: true, time },
                    })
                  }
                >
                  <Text style={styles.timeChipText}>{time}</Text>
                </Pressable>
              ),
            )}
          </View>
          <Pressable
            accessibilityLabel="Evening Check-In reminder"
            accessibilityRole="switch"
            accessibilityState={{
              checked: settings.checkInReminder.enabled,
            }}
            aria-checked={settings.checkInReminder.enabled}
            style={[
              styles.reminderToggle,
              settings.checkInReminder.enabled
                ? styles.reminderToggleActive
                : undefined,
            ]}
            onPress={() =>
              updateSettings({
                checkInReminder: {
                  ...settings.checkInReminder,
                  enabled: !settings.checkInReminder.enabled,
                },
              })
            }
          >
            <View
              style={[
                styles.reminderThumb,
                settings.checkInReminder.enabled
                  ? styles.reminderThumbActive
                  : undefined,
              ]}
            />
          </Pressable>
        </View>
      </View>

      <View style={[styles.topGrid, isWide ? styles.topGridWide : undefined]}>
        <View style={styles.checkInCard}>
          <View style={styles.cardHeading}>
            <View>
              <Text style={styles.cardEyebrow}>TODAY</Text>
              <Text style={styles.cardTitle}>{formatFriendlyDate(today)}</Text>
            </View>
            {todayEntry ? (
              <View style={styles.editPill}>
                <Text style={styles.editPillText}>Editable</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.prompt}>How are you feeling?</Text>
          <View style={styles.moodGrid}>
            {moodOptions.map((option) => {
              const selected = mood === option.value;
              const colors = moodColors(theme, option.value);

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  accessibilityLabel={`Mood ${option.value}, ${option.label}`}
                  style={({ pressed }) => [
                    styles.moodButton,
                    {
                      backgroundColor: selected
                        ? colors.soft
                        : theme.background,
                      borderColor: selected ? colors.strong : theme.border,
                    },
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                  onPress={() => selectMood(option.value)}
                >
                  <Text
                    style={[
                      styles.moodNumber,
                      { color: selected ? colors.strong : theme.textMuted },
                    ]}
                  >
                    {option.value}
                  </Text>
                  <Text
                    style={[
                      styles.moodLabel,
                      { color: selected ? theme.text : theme.textMuted },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.field}>
            <View style={styles.fieldHeading}>
              <Text style={styles.fieldLabel}>One-word feeling</Text>
              <Text style={styles.optionalLabel}>Optional</Text>
            </View>
            <TextInput
              accessibilityLabel="One-word feeling"
              autoCapitalize="none"
              maxLength={24}
              placeholder="steady, tired, hopeful..."
              placeholderTextColor={theme.textMuted}
              returnKeyType="next"
              style={styles.input}
              value={feeling}
              onChangeText={changeFeeling}
            />
          </View>

          <View style={styles.field}>
            <View style={styles.fieldHeading}>
              <Text style={styles.fieldLabel}>Anything else?</Text>
              <Text style={styles.optionalLabel}>Optional</Text>
            </View>
            <TextInput
              accessibilityLabel="Check-In reflection"
              multiline
              placeholder="A sentence, a page, or nothing at all."
              placeholderTextColor={theme.textMuted}
              style={[styles.input, styles.reflectionInput]}
              textAlignVertical="top"
              value={reflection}
              onChangeText={changeReflection}
            />
          </View>

          <View
            style={[
              styles.saveRow,
              isCompact ? styles.saveRowCompact : undefined,
            ]}
          >
            <Text
              accessibilityLiveRegion="polite"
              style={styles.saveHint}
            >
              {saveError
                ? saveError
                : saved
                ? "Saved. You can change it whenever you need."
                : todayEntry
                  ? "Saving updates today's entry."
                  : "Nothing is recorded until you save."}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !mood || saving }}
              aria-disabled={!mood || saving}
              disabled={!mood || saving}
              style={({ pressed }) => [
                styles.saveButton,
                !mood || saving ? styles.saveButtonDisabled : undefined,
                pressed && mood && !saving
                  ? styles.buttonPressed
                  : undefined,
              ]}
              onPress={() => void submit()}
            >
              <Text style={styles.saveButtonText}>
                {saving
                  ? "Saving..."
                  : todayEntry
                    ? "Update check-in"
                    : "Save check-in"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.trendCard}>
          <View style={styles.trendHeading}>
            <View>
              <Text style={styles.cardEyebrow}>MOOD VIEW</Text>
              <Text style={styles.cardTitle}>Your recent shape</Text>
            </View>
            <View style={styles.trendToggle}>
              {([7, 30] as const).map((days) => (
                <Pressable
                  key={days}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: trendDays === days }}
                  aria-checked={trendDays === days}
                  style={[
                    styles.trendToggleButton,
                    trendDays === days
                      ? styles.trendToggleButtonActive
                      : undefined,
                  ]}
                  onPress={() => setTrendDays(days)}
                >
                  <Text
                    style={[
                      styles.trendToggleText,
                      trendDays === days
                        ? styles.trendToggleTextActive
                        : undefined,
                    ]}
                  >
                    {days} days
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={styles.trendNote}>
            Only days you chose to check in appear here.
          </Text>

          {trend.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.trendChart}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {trend.map((entry) => (
                <TrendBar
                  key={entry.id}
                  entry={entry}
                  styles={styles}
                  theme={theme}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyTrend}>
              <View style={styles.emptyTrendBars}>
                <View style={[styles.emptyTrendBar, { height: 24 }]} />
                <View style={[styles.emptyTrendBar, { height: 42 }]} />
                <View style={[styles.emptyTrendBar, { height: 30 }]} />
                <View style={[styles.emptyTrendBar, { height: 54 }]} />
              </View>
              <Text style={styles.emptyTrendTitle}>No trend to interpret</Text>
              <Text style={styles.emptyTrendText}>
                If you check in, this space will gently reflect what you saved.
              </Text>
            </View>
          )}
        </View>
      </View>

      <View
        style={[
          styles.historyHeading,
          isCompact ? styles.historyHeadingCompact : undefined,
        ]}
      >
        <View>
          <Text style={styles.cardEyebrow}>PAST ENTRIES</Text>
          <Text style={styles.historyTitle}>Look back without judgment</Text>
        </View>
        <View
          style={[
            styles.searchWrap,
            isCompact ? styles.searchWrapCompact : undefined,
          ]}
        >
          <TextInput
            accessibilityLabel="Search Check-Ins"
            placeholder="Search reflections..."
            placeholderTextColor={theme.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear Check-In search"
              style={styles.clearSearch}
              onPress={() => setQuery("")}
            >
              <Text style={styles.clearSearchText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.historyList}>
        {visibleEntries.length > 0 ? (
          visibleEntries.map((entry) => (
            <HistoryEntry
              key={entry.id}
              entry={entry}
              styles={styles}
              theme={theme}
            />
          ))
        ) : (
          <View style={styles.historyEmpty}>
            <Text style={styles.historyEmptyTitle}>
              {query ? "No matching entries" : "No entries yet"}
            </Text>
            <Text style={styles.historyEmptyText}>
              {query
                ? "Try a different feeling or phrase."
                : "There is nothing to catch up on. Check in only when it helps."}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function TrendBar({
  entry,
  styles,
  theme,
}: {
  entry: CheckInEntry;
  styles: ReturnType<typeof createStyles>;
  theme: OrganaTheme;
}) {
  const colors = moodColors(theme, entry.mood);

  return (
    <View style={styles.trendPoint}>
      <Text style={styles.trendValue}>{entry.mood}</Text>
      <View style={styles.trendTrack}>
        <View
          style={[
            styles.trendBar,
            {
              backgroundColor: colors.strong,
              height: entry.mood * 15,
            },
          ]}
        />
      </View>
      <Text style={styles.trendDate}>{formatShortDate(entry.date)}</Text>
    </View>
  );
}

function HistoryEntry({
  entry,
  styles,
  theme,
}: {
  entry: CheckInEntry;
  styles: ReturnType<typeof createStyles>;
  theme: OrganaTheme;
}) {
  const colors = moodColors(theme, entry.mood);

  return (
    <View style={styles.historyCard}>
      <View style={[styles.historyMood, { backgroundColor: colors.soft }]}>
        <Text style={[styles.historyMoodNumber, { color: colors.strong }]}>
          {entry.mood}
        </Text>
      </View>
      <View style={styles.historyCopy}>
        <View style={styles.historyMeta}>
          <Text style={styles.historyDate}>
            {formatFriendlyDate(entry.date)}
          </Text>
          {entry.feeling ? (
            <View style={styles.feelingPill}>
              <Text style={styles.feelingText}>{entry.feeling}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.historyReflection}>
          {entry.reflection || "No reflection added, and that is enough."}
        </Text>
      </View>
    </View>
  );
}

function moodColors(theme: OrganaTheme, mood: MoodRating) {
  if (mood <= 2) return { strong: theme.must, soft: theme.mustSoft };
  if (mood === 3) return { strong: theme.nice, soft: theme.niceSoft };
  return { strong: theme.should, soft: theme.shouldSoft };
}

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatFriendlyDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(parseDate(date));
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(parseDate(date));
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
      alignItems: "flex-start",
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
      maxWidth: 570,
    },
    optionalPill: {
      backgroundColor: theme.shouldSoft,
      borderRadius: 20,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    optionalPillText: {
      color: theme.should,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
    },
    reminderCard: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 18,
      justifyContent: "space-between",
      marginBottom: 24,
      padding: 17,
    },
    reminderCopy: {
      flex: 1,
      minWidth: 250,
    },
    reminderTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    reminderText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      lineHeight: 14,
      marginTop: 4,
      maxWidth: 520,
    },
    reminderControls: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    timeChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
    },
    timeChip: {
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 7,
    },
    timeChipActive: {
      backgroundColor: theme.shouldSoft,
      borderColor: theme.accent,
    },
    timeChipDisabled: { opacity: 0.4 },
    timeChipText: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 8,
    },
    reminderToggle: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 15,
      height: 30,
      padding: 3,
      width: 50,
    },
    reminderToggleActive: { backgroundColor: theme.accent },
    reminderThumb: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      height: 24,
      width: 24,
    },
    reminderThumbActive: { alignSelf: "flex-end" },
    topGrid: {
      gap: 22,
    },
    topGridWide: {
      alignItems: "stretch",
      flexDirection: "row",
    },
    checkInCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 22,
      borderWidth: 1,
      flex: 1.35,
      padding: 22,
    },
    trendCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 22,
      borderWidth: 1,
      flex: 1,
      minWidth: 0,
      padding: 22,
    },
    cardHeading: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 24,
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
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 17,
      letterSpacing: -0.4,
    },
    editPill: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    editPillText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    prompt: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 13,
      marginBottom: 11,
    },
    moodGrid: {
      flexDirection: "row",
      gap: 8,
    },
    moodButton: {
      alignItems: "center",
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 5,
      paddingVertical: 11,
    },
    moodNumber: {
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 16,
    },
    moodLabel: {
      fontFamily: "Manrope_600SemiBold",
      fontSize: 8,
      marginTop: 2,
    },
    buttonPressed: {
      opacity: 0.68,
    },
    field: {
      marginTop: 20,
    },
    fieldHeading: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 7,
    },
    fieldLabel: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    optionalLabel: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
    },
    input: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 13,
      borderWidth: 1,
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
      minHeight: 46,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    reflectionInput: {
      minHeight: 104,
    },
    saveRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 16,
      justifyContent: "space-between",
      marginTop: 20,
    },
    saveRowCompact: {
      alignItems: "stretch",
      flexDirection: "column",
    },
    saveHint: {
      color: theme.textMuted,
      flex: 1,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      lineHeight: 14,
    },
    saveButton: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 13,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 18,
    },
    saveButtonDisabled: {
      opacity: 0.35,
    },
    saveButtonText: {
      color: theme.background,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
    },
    trendHeading: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    trendToggle: {
      backgroundColor: theme.background,
      borderRadius: 12,
      flexDirection: "row",
      padding: 3,
    },
    trendToggleButton: {
      borderRadius: 9,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    trendToggleButtonActive: {
      backgroundColor: theme.surface,
    },
    trendToggleText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    trendToggleTextActive: {
      color: theme.accentStrong,
    },
    trendNote: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      lineHeight: 14,
      marginTop: 9,
    },
    trendChart: {
      alignItems: "flex-end",
      gap: 9,
      minHeight: 148,
      paddingTop: 22,
    },
    trendPoint: {
      alignItems: "center",
      width: 38,
    },
    trendValue: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
      marginBottom: 5,
    },
    trendTrack: {
      alignItems: "center",
      height: 78,
      justifyContent: "flex-end",
    },
    trendBar: {
      borderRadius: 7,
      minHeight: 10,
      width: 20,
    },
    trendDate: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 7,
      marginTop: 7,
    },
    emptyTrend: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: 225,
      paddingTop: 18,
    },
    emptyTrendBars: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 7,
      height: 60,
      marginBottom: 17,
    },
    emptyTrendBar: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 6,
      width: 15,
    },
    emptyTrendTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    emptyTrendText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      lineHeight: 15,
      marginTop: 5,
      maxWidth: 260,
      textAlign: "center",
    },
    historyHeading: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 20,
      justifyContent: "space-between",
      marginBottom: 13,
      marginTop: 38,
    },
    historyHeadingCompact: {
      alignItems: "stretch",
      flexDirection: "column",
    },
    historyTitle: {
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
      minWidth: 270,
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
    historyList: {
      gap: 9,
    },
    historyCard: {
      alignItems: "flex-start",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 13,
      padding: 15,
    },
    historyMood: {
      alignItems: "center",
      borderRadius: 12,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    historyMoodNumber: {
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 16,
    },
    historyCopy: {
      flex: 1,
      minWidth: 0,
    },
    historyMeta: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    historyDate: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    feelingPill: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    feelingText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    historyReflection: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 10,
      lineHeight: 16,
      marginTop: 6,
    },
    historyEmpty: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 22,
      paddingVertical: 34,
    },
    historyEmptyTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 13,
    },
    historyEmptyText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 10,
      lineHeight: 16,
      marginTop: 5,
      maxWidth: 400,
      textAlign: "center",
    },
  });
}
