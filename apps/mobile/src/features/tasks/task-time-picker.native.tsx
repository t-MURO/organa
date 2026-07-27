import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, Text, View } from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useAppTheme } from "../../components/app-shell";
import { StyleSheet } from "../../typography";
import type { TaskTimePickerProps } from "./task-time-picker.types";

export function TimePickerField({
  accessibilityLabel,
  value,
  onChange,
}: TaskTimePickerProps) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [open, setOpen] = useState(false);
  const selectedTime = parseLocalTime(value) ?? new Date();

  if (Platform.OS === "ios") {
    return (
      <View style={styles.row}>
        {value ? (
          <View style={styles.iosPicker}>
            <DateTimePicker
              accentColor={theme.accentStrong}
              display="compact"
              mode="time"
              testID={accessibilityLabel}
              value={selectedTime}
              onValueChange={(_, date) => onChange(formatTimeValue(date))}
            />
          </View>
        ) : (
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            style={styles.field}
            onPress={() => onChange(formatTimeValue(new Date()))}
          >
            <Text style={styles.placeholder}>Choose a time</Text>
            <Text aria-hidden style={styles.clockMark}>
              TIME
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
        <Text style={value ? styles.value : styles.placeholder}>
          {value || "Choose a time"}
        </Text>
        <Text aria-hidden style={styles.clockMark}>
          TIME
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
          is24Hour
          mode="time"
          negativeButton={{ label: "Cancel" }}
          positiveButton={{ label: "Choose" }}
          presentation="dialog"
          value={selectedTime}
          onDismiss={() => setOpen(false)}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(formatTimeValue(date));
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

function parseLocalTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

function formatTimeValue(value: Date) {
  return `${value.getHours().toString().padStart(2, "0")}:${value
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
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
      minHeight: 44,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    value: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
    },
    placeholder: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
    },
    clockMark: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 0.6,
    },
    clearButton: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
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
      minHeight: 44,
    },
  });
}
