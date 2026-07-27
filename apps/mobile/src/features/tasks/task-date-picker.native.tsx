import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { formatLocalDate } from "@organa/domain";
import { useState } from "react";
import { Platform, Text, View } from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useAppTheme } from "../../components/app-shell";
import { StyleSheet } from "../../typography";
import type { TaskDatePickerProps } from "./task-date-picker.types";

export function DatePickerField({
  accessibilityLabel,
  value,
  onChange,
}: TaskDatePickerProps) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [open, setOpen] = useState(false);
  const selectedDate = parseLocalDate(value) ?? new Date();

  if (Platform.OS === "ios") {
    return (
      <View style={styles.row}>
        {value ? (
          <View style={styles.iosPicker}>
            <DateTimePicker
              accentColor={theme.accentStrong}
              display="compact"
              mode="date"
              testID={accessibilityLabel}
              value={selectedDate}
              onValueChange={(_, date) => onChange(formatLocalDate(date))}
            />
          </View>
        ) : (
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            style={styles.field}
            onPress={() => onChange(formatLocalDate(new Date()))}
          >
            <Text numberOfLines={1} style={styles.placeholder}>
              Choose a date
            </Text>
            <Text aria-hidden style={styles.calendarMark}>
              CAL
            </Text>
          </Pressable>
        )}
        {value ? (
          <ClearButton
            label={accessibilityLabel}
            styles={styles}
            onClear={() => onChange("")}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        style={styles.field}
        onPress={() => setOpen(true)}
      >
        <Text
          numberOfLines={1}
          style={value ? styles.value : styles.placeholder}
        >
          {value ? formatDateLabel(selectedDate) : "Choose a date"}
        </Text>
        <Text aria-hidden style={styles.calendarMark}>
          CAL
        </Text>
      </Pressable>
      {value ? (
        <ClearButton
          label={accessibilityLabel}
          styles={styles}
          onClear={() => onChange("")}
        />
      ) : null}
      {open ? (
        <DateTimePicker
          accentColor={theme.accentStrong}
          mode="date"
          negativeButton={{ label: "Cancel" }}
          positiveButton={{ label: "Choose" }}
          presentation="dialog"
          value={selectedDate}
          onDismiss={() => setOpen(false)}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(formatLocalDate(date));
          }}
        />
      ) : null}
    </View>
  );
}

function ClearButton({
  label,
  styles,
  onClear,
}: {
  label: string;
  styles: ReturnType<typeof createStyles>;
  onClear(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Clear ${label.toLowerCase()}`}
      accessibilityRole="button"
      style={styles.clearButton}
      onPress={onClear}
    >
      <Text style={styles.clearText}>Clear</Text>
    </Pressable>
  );
}

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function createStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minHeight: 44,
    },
    field: {
      alignItems: "center",
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minWidth: 0,
      minHeight: 44,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    value: {
      color: theme.text,
      flex: 1,
      flexShrink: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
    },
    placeholder: {
      color: theme.textMuted,
      flex: 1,
      flexShrink: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
    },
    calendarMark: {
      color: theme.accentStrong,
      flexShrink: 0,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 0.6,
      marginLeft: 8,
    },
    clearButton: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      flexShrink: 0,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 10,
    },
    clearText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    iosPicker: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
    },
  });
}
