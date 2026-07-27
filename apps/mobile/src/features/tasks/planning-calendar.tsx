import { formatLocalDate, type Task } from "@organa/domain";
import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useAppTheme } from "../../components/app-shell";
import type { OrganaTheme } from "../../theme";
import { StyleSheet } from "../../typography";

export function PlanningCalendar({
  selectedDate,
  tasks,
  onSelectDate,
}: {
  selectedDate: string;
  tasks: Task[];
  onSelectDate(date: string): void;
}) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<"week" | "month">("week");
  const compact = width < 620;
  const selected = parseLocalDate(selectedDate);
  const dates =
    mode === "week" ? weekDates(selected) : monthDates(selected);

  function move(direction: -1 | 1) {
    const next = new Date(selected);
    if (mode === "week") {
      next.setDate(next.getDate() + direction * 7);
    } else {
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
    }
    onSelectDate(formatLocalDate(next));
  }

  return (
    <View style={styles.card}>
      <View
        style={[styles.header, compact ? styles.headerCompact : undefined]}
      >
        <View>
          <Text style={styles.eyebrow}>CALENDAR</Text>
          <Text style={styles.title}>
            {new Intl.DateTimeFormat(undefined, {
              month: "long",
              year: "numeric",
            }).format(selected)}
          </Text>
        </View>
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Previous ${mode}`}
            style={styles.navButton}
            onPress={() => move(-1)}
          >
            <Text style={styles.navButtonText}>Prev</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.todayButton}
            onPress={() => onSelectDate(formatLocalDate(new Date()))}
          >
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Next ${mode}`}
            style={styles.navButton}
            onPress={() => move(1)}
          >
            <Text style={styles.navButtonText}>Next</Text>
          </Pressable>
          <View style={styles.modeToggle}>
            {(["week", "month"] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === item }}
                aria-checked={mode === item}
                style={[
                  styles.modeButton,
                  mode === item ? styles.modeButtonActive : undefined,
                ]}
                onPress={() => setMode(item)}
              >
                <Text
                  style={[
                    styles.modeText,
                    mode === item ? styles.modeTextActive : undefined,
                  ]}
                >
                  {item === "week" ? "Week" : "Month"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {mode === "month" ? (
        <View style={styles.weekdayRow}>
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
            <Text key={`${day}-${index}`} style={styles.weekday}>
              {day}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={mode === "week" ? styles.weekGrid : styles.monthGrid}>
        {dates.map((date) => {
          const dateKey = formatLocalDate(date);
          const selectedDay = dateKey === selectedDate;
          const today = dateKey === formatLocalDate(new Date());
          const outsideMonth =
            mode === "month" && date.getMonth() !== selected.getMonth();
          const taskCount = tasks.filter(
            (task) => task.plannedFor === dateKey && !task.completedAt,
          ).length;

          return (
            <Pressable
              key={dateKey}
              accessibilityRole="button"
              accessibilityLabel={`${formatAccessibleDate(date)}, ${taskCount} active tasks`}
              accessibilityState={{ selected: selectedDay }}
              aria-selected={selectedDay}
              style={[
                styles.day,
                mode === "month" ? styles.monthDay : styles.weekDay,
                selectedDay ? styles.daySelected : undefined,
                outsideMonth ? styles.dayOutside : undefined,
              ]}
              onPress={() => onSelectDate(dateKey)}
            >
              {mode === "week" ? (
                <Text
                  style={[
                    styles.dayName,
                    selectedDay ? styles.dayTextSelected : undefined,
                  ]}
                >
                  {new Intl.DateTimeFormat(undefined, {
                    weekday: "short",
                  }).format(date)}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.dayNumber,
                  selectedDay ? styles.dayTextSelected : undefined,
                ]}
              >
                {date.getDate()}
              </Text>
              <View style={styles.dayFooter}>
                {today ? <View style={styles.todayDot} /> : <View />}
                {taskCount > 0 ? (
                  <View
                    style={[
                      styles.taskCount,
                      selectedDay ? styles.taskCountSelected : undefined,
                    ]}
                  >
                    <Text
                      style={[
                        styles.taskCountText,
                        selectedDay
                          ? styles.taskCountTextSelected
                          : undefined,
                      ]}
                    >
                      {taskCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function weekDates(anchor: Date) {
  const start = new Date(anchor);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function monthDates(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = weekDates(first)[0];

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatAccessibleDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function createStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 22,
      borderWidth: 1,
      marginBottom: 32,
      padding: 18,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 16,
      justifyContent: "space-between",
      marginBottom: 16,
    },
    headerCompact: {
      alignItems: "flex-start",
      flexDirection: "column",
    },
    eyebrow: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 1.4,
      marginBottom: 3,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 17,
    },
    controls: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    navButton: {
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    navButtonText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    todayButton: {
      backgroundColor: theme.shouldSoft,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    todayButtonText: {
      color: theme.should,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    modeToggle: {
      backgroundColor: theme.background,
      borderRadius: 11,
      flexDirection: "row",
      padding: 3,
    },
    modeButton: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    modeButtonActive: {
      backgroundColor: theme.surfaceMuted,
    },
    modeText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    modeTextActive: {
      color: theme.text,
    },
    weekdayRow: {
      flexDirection: "row",
      marginBottom: 5,
    },
    weekday: {
      color: theme.textMuted,
      flex: 1,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
      textAlign: "center",
    },
    weekGrid: {
      flexDirection: "row",
      gap: 7,
    },
    monthGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    day: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
    },
    weekDay: {
      flex: 1,
      minHeight: 82,
      padding: 9,
    },
    monthDay: {
      borderRadius: 9,
      minHeight: 54,
      padding: 6,
      width: "14.2857%",
    },
    daySelected: {
      backgroundColor: theme.accentStrong,
      borderColor: theme.accentStrong,
    },
    dayOutside: {
      opacity: 0.38,
    },
    dayName: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 8,
    },
    dayNumber: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 14,
      marginTop: 4,
    },
    dayTextSelected: {
      color: theme.background,
    },
    dayFooter: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: "auto",
    },
    todayDot: {
      backgroundColor: theme.nice,
      borderRadius: 4,
      height: 6,
      width: 6,
    },
    taskCount: {
      alignItems: "center",
      backgroundColor: theme.surfaceMuted,
      borderRadius: 8,
      height: 17,
      justifyContent: "center",
      minWidth: 17,
      paddingHorizontal: 4,
    },
    taskCountSelected: {
      backgroundColor: theme.accent,
    },
    taskCountText: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 7,
    },
    taskCountTextSelected: {
      color: theme.background,
    },
  });
}
