import { formatLocalDate, type Task } from "@organa/domain";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useAuth } from "../../auth/auth-context";
import { clearPendingTaskSnoozes } from "../../data/create-task-snooze-scheduler.web";
import {
  readShownReminderKeys,
  rememberShownReminder,
} from "../../data/in-app-reminder-history.web";
import { darkTheme, lightTheme } from "../../theme";
import {
  taskSnoozeEvent,
  type TaskSnoozeEventDetail,
} from "../../data/task-snooze-scheduler.types";
import { useDevices } from "../account/device-context";
import { useCheckIns } from "../check-in/check-in-context";
import { useSettings } from "../settings/settings-context";
import { useTasks } from "../tasks/task-context";
import {
  findTaskReminder,
  type InAppReminder,
} from "./in-app-reminder-candidates";

export function NotificationCoordinator() {
  const router = useRouter();
  const auth = useAuth();
  const ownerId = auth.localPreview
    ? "local-preview"
    : (auth.user?.id ?? "signed-out");
  const { tasks } = useTasks();
  const { entries } = useCheckIns();
  const devices = useDevices();
  const { settings } = useSettings();
  const systemScheme = useColorScheme();
  const effectiveMode =
    settings.theme === "system" ? (systemScheme ?? "light") : settings.theme;
  const theme = effectiveMode === "dark" ? darkTheme : lightTheme;
  const styles = createStyles(theme);
  const [notice, setNotice] = useState<InAppReminder>();
  const noticeRef = useRef<InAppReminder | undefined>(undefined);
  const tasksRef = useRef(tasks);
  const shown = useRef(readShownReminderKeys(ownerId));
  const shownOwnerId = useRef(ownerId);
  const snoozeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  if (shownOwnerId.current !== ownerId) {
    shownOwnerId.current = ownerId;
    shown.current = readShownReminderKeys(ownerId);
  }
  tasksRef.current = tasks;

  useEffect(() => {
    noticeRef.current = notice;
  }, [notice]);

  useEffect(() => {
    snoozeTimers.current.forEach(clearTimeout);
    snoozeTimers.current = [];
    noticeRef.current = undefined;
    setNotice(undefined);
    return () => clearPendingTaskSnoozes(ownerId);
  }, [ownerId]);

  useEffect(() => {
    function receiveSnooze(event: Event) {
      const detail = (event as CustomEvent<TaskSnoozeEventDetail>).detail;
      const validDetail = isTaskSnoozeEventDetail(detail);
      const currentTask = validDetail
        ? deliverableSnoozeTask(
            tasksRef.current,
            detail,
            detail.snoozedForMinutes,
          )
        : undefined;
      if (
        !devices.reminderAuthorizationReady ||
        !devices.remindersAllowed ||
        !validDetail ||
        detail.ownerId !== ownerId ||
        !currentTask
      ) {
        return;
      }
      const currentNotice = {
        ...detail,
        body: `${currentTask.title} is ready when you are.`,
        snoozePresets: currentTask.snoozePresets,
      };
      noticeRef.current = currentNotice;
      setNotice(currentNotice);
    }

    window.addEventListener(taskSnoozeEvent, receiveSnooze);
    return () => window.removeEventListener(taskSnoozeEvent, receiveSnooze);
  }, [
    devices.reminderAuthorizationReady,
    devices.remindersAllowed,
    ownerId,
  ]);

  useEffect(() => {
    if (!devices.reminderAuthorizationReady || !devices.remindersAllowed) {
      return;
    }

    function scan() {
      if (noticeRef.current) return;
      const now = new Date();
      const candidate =
        findTaskReminder(tasks, now, shown.current) ??
        findCheckInReminder(
          entries.map((entry) => entry.date),
          settings.checkInReminder,
          now,
          shown.current,
        );
      if (!candidate) return;
      rememberShownReminder(ownerId, candidate.key, shown.current);
      noticeRef.current = candidate;
      setNotice(candidate);
    }

    scan();
    const interval = setInterval(scan, 15_000);
    return () => clearInterval(interval);
  }, [
    devices.reminderAuthorizationReady,
    devices.remindersAllowed,
    entries,
    settings.checkInReminder,
    tasks,
    ownerId,
  ]);

  useEffect(() => {
    if (
      devices.reminderAuthorizationReady &&
      devices.remindersAllowed
    ) {
      return;
    }
    snoozeTimers.current.forEach(clearTimeout);
    snoozeTimers.current = [];
    noticeRef.current = undefined;
    setNotice(undefined);
  }, [
    devices.reminderAuthorizationReady,
    devices.remindersAllowed,
  ]);

  useEffect(
    () => () => {
      snoozeTimers.current.forEach(clearTimeout);
    },
    [],
  );

  if (!notice) return null;

  function open() {
    setNotice(undefined);
    if (notice?.route === "/focus" && notice.taskId) {
      router.push({ pathname: "/focus", params: { taskId: notice.taskId } });
    } else {
      router.push("/check-in");
    }
  }

  function snooze(minutes: number) {
    const snoozed = {
      ...notice!,
      key: `${notice!.key}:snooze:${Date.now()}`,
    };
    setNotice(undefined);
    snoozeTimers.current.push(
      setTimeout(() => {
        if (
          !canDeliverTaskSnooze(tasksRef.current, snoozed, minutes)
        ) {
          return;
        }
        noticeRef.current = snoozed;
        setNotice(snoozed);
      }, minutes * 60 * 1_000),
    );
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      pointerEvents="box-none"
      style={styles.positioner}
    >
      <View style={styles.card}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>GENTLE IN-APP REMINDER</Text>
          <Text style={styles.title}>{notice.title}</Text>
          <Text style={styles.body}>{notice.body}</Text>
        </View>
        <View style={styles.actions}>
          {notice.snoozePresets.map((minutes) => (
            <Pressable
              key={minutes}
              accessibilityLabel={`Snooze for ${minutes} minutes`}
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={() => snooze(minutes)}
            >
              <Text style={styles.secondaryText}>Snooze {minutes}m</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={open}
          >
            <Text style={styles.primaryText}>
              {notice.route === "/focus" ? "Open task" : "Check in"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Dismiss reminder"
            accessibilityRole="button"
            style={styles.dismissButton}
            onPress={() => setNotice(undefined)}
          >
            <Text style={styles.dismissText}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function isTaskSnoozeEventDetail(
  value: unknown,
): value is TaskSnoozeEventDetail {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const detail = value as Record<string, unknown>;
  return (
    typeof detail.body === "string" &&
    typeof detail.key === "string" &&
    typeof detail.ownerId === "string" &&
    detail.ownerId.length > 0 &&
    detail.route === "/focus" &&
    typeof detail.snoozedForMinutes === "number" &&
    Number.isSafeInteger(detail.snoozedForMinutes) &&
    detail.snoozedForMinutes > 0 &&
    Array.isArray(detail.snoozePresets) &&
    detail.snoozePresets.every(
      (minutes) => Number.isSafeInteger(minutes) && minutes > 0,
    ) &&
    typeof detail.taskId === "string" &&
    typeof detail.title === "string"
  );
}

function canDeliverTaskSnooze(
  tasks: Task[],
  notice: Pick<InAppReminder, "subtaskId" | "taskId" | "snoozePresets">,
  minutes: number,
) {
  return Boolean(deliverableSnoozeTask(tasks, notice, minutes));
}

function deliverableSnoozeTask(
  tasks: Task[],
  notice: Pick<InAppReminder, "subtaskId" | "taskId" | "snoozePresets">,
  minutes: number,
) {
  if (!notice.taskId || !notice.snoozePresets.includes(minutes)) {
    return undefined;
  }
  const task = tasks.find((candidate) => candidate.id === notice.taskId);
  if (!task || task.completedAt || !task.snoozePresets.includes(minutes)) {
    return undefined;
  }
  if (!notice.subtaskId) return task;
  const subtask = task.subtasks.find(
    (candidate) => candidate.id === notice.subtaskId,
  );
  return subtask && !subtask.completedAt ? task : undefined;
}

function findCheckInReminder(
  entryDates: string[],
  setting: { enabled: boolean; time: string },
  now: Date,
  shown: Set<string>,
): InAppReminder | undefined {
  if (!setting.enabled) return undefined;
  const today = formatLocalDate(now);
  const key = `check-in:${today}`;
  if (entryDates.includes(today) || shown.has(key)) return undefined;
  const [hours, minutes] = setting.time.split(":").map(Number);
  const triggerAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
  );
  if (Number.isNaN(triggerAt.getTime()) || now < triggerAt) return undefined;
  return {
    body: "A number is enough; words are optional.",
    key,
    route: "/check-in",
    snoozePresets: [],
    title: "A quiet moment, if you want it",
  };
}

function createStyles(theme: typeof lightTheme) {
  return StyleSheet.create({
    actions: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    body: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 12,
      marginTop: 3,
    },
    card: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      boxShadow: `0 18px 50px ${theme.shadow}26`,
      flexDirection: "row",
      gap: 20,
      justifyContent: "space-between",
      maxWidth: 760,
      padding: 16,
      width: "100%",
    },
    copy: { flex: 1 },
    dismissButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 8,
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
      left: 0,
      paddingHorizontal: 16,
      position: "absolute",
      right: 0,
      top: 16,
      zIndex: 100,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 11,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 14,
    },
    primaryText: {
      color: theme.surface,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 11,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 12,
    },
    secondaryText: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 14,
      marginTop: 3,
    },
  });
}
