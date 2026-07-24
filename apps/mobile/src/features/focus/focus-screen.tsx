import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useAppTheme } from "../../components/app-shell";
import type { OrganaTheme } from "../../theme";
import { useTasks } from "../tasks/task-context";

const timerOptions = [
  { minutes: 5, label: "5 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 25, label: "25 min" },
];

export function FocusScreen() {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const { confirmDose, loading, tasks, toggleSubtask, toggleTask } = useTasks();
  const task = tasks.find((item) => item.id === taskId);
  const [timerMinutes, setTimerMinutes] = useState<number>();
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"task" | "break">("task");

  useEffect(() => {
    if (!running || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, secondsRemaining]);

  function chooseTimer(minutes: number) {
    setMode("task");
    setTimerMinutes(minutes);
    setSecondsRemaining(minutes * 60);
    setRunning(false);
  }

  function resetTimer() {
    setMode("task");
    setSecondsRemaining((timerMinutes ?? 0) * 60);
    setRunning(false);
  }

  function takeBreak() {
    setMode("break");
    setSecondsRemaining(5 * 60);
    setRunning(true);
  }

  function returnToTask() {
    resetTimer();
  }

  function toggleTimer() {
    if (secondsRemaining === 0 && timerMinutes) {
      setSecondsRemaining(timerMinutes * 60);
      setRunning(true);
      return;
    }
    setRunning((current) => !current);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Clearing a little space...</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={styles.missingTitle}>That task is no longer here.</Text>
        <Text style={styles.missingText}>
          It may have been removed on another screen.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.exitButton}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.exitButtonText}>Return to today</Text>
        </Pressable>
      </View>
    );
  }

  const timerFinished = Boolean(timerMinutes) && secondsRemaining === 0;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>organa</Text>
          <Text style={styles.focusLabel}>
            {mode === "break" ? "RESET SPACE" : "FOCUS SPACE"}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Exit focus mode"
          accessibilityRole="button"
          style={styles.exitButton}
          onPress={() => router.back()}
        >
          <Text style={styles.exitButtonText}>Exit focus</Text>
        </Pressable>
      </View>

      <View style={styles.stage}>
        <Text style={styles.eyebrow}>
          {mode === "break"
            ? "NOTHING TO SOLVE FOR FIVE MINUTES"
            : formatTaskKind(task.kind)}
        </Text>
        <Text
          style={[
            styles.taskTitle,
            task.completedAt ? styles.taskTitleCompleted : undefined,
          ]}
        >
          {mode === "break" ? "Let your attention soften." : task.title}
        </Text>
        {mode === "task" && task.details ? (
          <Text style={styles.details}>{task.details}</Text>
        ) : null}

        <View style={styles.timerCard}>
          {mode === "task" && !timerMinutes ? (
            <>
              <Text style={styles.timerPrompt}>Would a timer help?</Text>
              <Text style={styles.timerHint}>
                Optional means optional. The task stays here either way.
              </Text>
              <View style={styles.timerOptions}>
                {timerOptions.map((option) => (
                  <Pressable
                    key={option.minutes}
                    accessibilityRole="button"
                    style={styles.timerOption}
                    onPress={() => chooseTimer(option.minutes)}
                  >
                    <Text style={styles.timerOptionText}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.timerMode}>
                {mode === "break"
                  ? "FIVE-MINUTE BREAK"
                  : timerFinished
                    ? "TIME IS UP"
                    : running
                      ? "GENTLY IN PROGRESS"
                      : "READY WHEN YOU ARE"}
              </Text>
              <Text
                accessibilityLabel={`${Math.floor(
                  secondsRemaining / 60,
                )} minutes ${secondsRemaining % 60} seconds remaining`}
                style={styles.timer}
              >
                {formatTimer(secondsRemaining)}
              </Text>
              <View style={styles.timerControls}>
                {mode === "break" ? (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.primaryControl}
                    onPress={returnToTask}
                  >
                    <Text style={styles.primaryControlText}>Return to task</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.primaryControl}
                      onPress={toggleTimer}
                    >
                      <Text style={styles.primaryControlText}>
                        {running ? "Pause" : timerFinished ? "Restart" : "Start"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.softControl}
                      onPress={resetTimer}
                    >
                      <Text style={styles.softControlText}>Reset</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </>
          )}
        </View>

        {mode === "task" && task.subtasks.length > 0 ? (
          <View style={styles.steps}>
            <Text style={styles.stepsTitle}>Small steps</Text>
            {task.subtasks.map((subtask) => (
              <Pressable
                key={subtask.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: Boolean(subtask.completedAt) }}
                aria-checked={Boolean(subtask.completedAt)}
                style={styles.step}
                onPress={() => toggleSubtask(task, subtask.id)}
              >
                <View
                  style={[
                    styles.stepCheck,
                    subtask.completedAt ? styles.stepCheckDone : undefined,
                  ]}
                >
                  {subtask.completedAt ? (
                    <Text style={styles.stepCheckText}>✓</Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.stepText,
                    subtask.completedAt ? styles.stepTextDone : undefined,
                  ]}
                >
                  {subtask.title}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {mode === "task" ? (
          <View style={styles.finishRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: Boolean(task.completedAt) }}
              aria-checked={Boolean(task.completedAt)}
              style={[
                styles.completeButton,
                task.completedAt ? styles.completeButtonDone : undefined,
              ]}
              onPress={() => toggleTask(task)}
            >
              <View
                style={[
                  styles.completeCheck,
                  task.completedAt ? styles.completeCheckDone : undefined,
                ]}
              >
                {task.completedAt ? (
                  <Text style={styles.completeCheckText}>✓</Text>
                ) : null}
              </View>
              <Text style={styles.completeText}>
                {task.completedAt ? "Completed. Undo?" : "Mark task complete"}
              </Text>
            </Pressable>
            {task.completedAt &&
            task.kind === "medication" &&
            task.requireDoseConfirmation ? (
              task.doseConfirmedAt ? (
                <Text
                  accessibilityLabel="Medication dose confirmed"
                  style={styles.doseConfirmed}
                >
                  Dose confirmed
                </Text>
              ) : (
                <Pressable
                  accessibilityLabel={`Confirm dose for ${task.title}`}
                  accessibilityRole="button"
                  style={styles.doseButton}
                  onPress={() => confirmDose(task)}
                >
                  <Text style={styles.doseButtonText}>Confirm dose</Text>
                </Pressable>
              )
            ) : null}
            <Pressable
              accessibilityRole="button"
              style={styles.breakButton}
              onPress={takeBreak}
            >
              <Text style={styles.breakButtonText}>Take a five-minute break</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Text style={styles.footer}>
        One thing is enough for this moment. You can leave whenever you need.
      </Text>
    </ScrollView>
  );
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

function formatTaskKind(kind: "one_off" | "habit" | "medication") {
  if (kind === "habit") return "ONE ROUTINE";
  if (kind === "medication") return "ONE MEDICATION TASK";
  return "ONE CLEAR TASK";
}

function createStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    page: {
      alignSelf: "center",
      flexGrow: 1,
      maxWidth: 900,
      paddingBottom: 30,
      paddingHorizontal: 20,
      paddingTop: 20,
      width: "100%",
    },
    center: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 24,
    },
    loadingText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
    },
    missingTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 24,
    },
    missingText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      marginBottom: 20,
      marginTop: 8,
    },
    topBar: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    brand: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 20,
      letterSpacing: -0.8,
    },
    focusLabel: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
      letterSpacing: 1.5,
      marginTop: 2,
    },
    exitButton: {
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    exitButtonText: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
    },
    stage: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      paddingVertical: 36,
    },
    eyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 2,
      marginBottom: 14,
      textAlign: "center",
    },
    taskTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 38,
      letterSpacing: -1.8,
      lineHeight: 46,
      maxWidth: 720,
      textAlign: "center",
    },
    taskTitleCompleted: {
      opacity: 0.6,
      textDecorationLine: "line-through",
    },
    details: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 14,
      lineHeight: 21,
      marginTop: 12,
      maxWidth: 570,
      textAlign: "center",
    },
    timerCard: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 24,
      borderWidth: 1,
      marginTop: 32,
      maxWidth: 520,
      padding: 24,
      width: "100%",
    },
    timerPrompt: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 15,
    },
    timerHint: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 11,
      marginTop: 5,
      textAlign: "center",
    },
    timerOptions: { flexDirection: "row", gap: 8, marginTop: 18 },
    timerOption: {
      backgroundColor: theme.shouldSoft,
      borderRadius: 18,
      paddingHorizontal: 17,
      paddingVertical: 10,
    },
    timerOptionText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    timerMode: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 1.7,
    },
    timer: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 54,
      fontVariant: ["tabular-nums"],
      letterSpacing: -2,
      marginVertical: 12,
    },
    timerControls: { flexDirection: "row", gap: 8 },
    primaryControl: {
      backgroundColor: theme.accentStrong,
      borderRadius: 13,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    primaryControlText: {
      color: theme.background,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    softControl: {
      borderColor: theme.border,
      borderRadius: 13,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    softControlText: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
    },
    steps: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      gap: 5,
      marginTop: 16,
      maxWidth: 520,
      padding: 16,
      width: "100%",
    },
    stepsTitle: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.3,
      marginBottom: 5,
      textTransform: "uppercase",
    },
    step: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingVertical: 7,
    },
    stepCheck: {
      borderColor: theme.accentStrong,
      borderRadius: 6,
      borderWidth: 1.5,
      height: 21,
      width: 21,
    },
    stepCheckDone: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      justifyContent: "center",
    },
    stepCheckText: {
      color: theme.background,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
    },
    stepText: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
    },
    stepTextDone: {
      color: theme.textMuted,
      textDecorationLine: "line-through",
    },
    finishRow: {
      alignItems: "center",
      gap: 12,
      marginTop: 24,
      maxWidth: 520,
      width: "100%",
    },
    completeButton: {
      alignItems: "center",
      backgroundColor: theme.shouldSoft,
      borderRadius: 15,
      flexDirection: "row",
      gap: 10,
      justifyContent: "center",
      padding: 14,
      width: "100%",
    },
    completeButtonDone: { backgroundColor: theme.surfaceMuted },
    completeCheck: {
      borderColor: theme.accentStrong,
      borderRadius: 7,
      borderWidth: 1.5,
      height: 24,
      width: 24,
    },
    completeCheckDone: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      justifyContent: "center",
    },
    completeCheckText: {
      color: theme.background,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 12,
    },
    completeText: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    breakButton: { padding: 7 },
    breakButtonText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
    },
    doseButton: {
      backgroundColor: theme.mustSoft,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    doseButtonText: {
      color: theme.must,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
      textAlign: "center",
    },
    doseConfirmed: {
      color: theme.should,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
      textAlign: "center",
    },
    footer: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 10,
      textAlign: "center",
    },
  });
}
