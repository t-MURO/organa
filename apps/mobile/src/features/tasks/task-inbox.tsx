import { formatLocalDate, type Task } from "@organa/domain";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { useAppTheme } from "../../components/app-shell";
import type { OrganaTheme } from "../../theme";

type InboxFilter = "upcoming" | "overdue" | "completed";

export function TaskInbox({
  tasks,
  onEdit,
}: {
  tasks: Task[];
  onEdit(task: Task): void;
}) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<InboxFilter>("upcoming");
  const [query, setQuery] = useState("");
  const compact = width < 620;
  const now = new Date();
  const today = formatLocalDate(now);
  const filtered = tasks
    .filter((task) => matchesFilter(task, filter, now, today))
    .filter((task) =>
      `${task.title} ${task.details ?? ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    )
    .sort((left, right) => taskSortKey(left).localeCompare(taskSortKey(right)));

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.heading, compact ? styles.headingCompact : undefined]}
      >
        <View>
          <Text style={styles.eyebrow}>TASK INBOX</Text>
          <Text style={styles.title}>Everything still has a place</Text>
        </View>
        <View
          style={[
            styles.searchWrap,
            compact ? styles.searchWrapCompact : undefined,
          ]}
        >
          <TextInput
            accessibilityLabel="Search tasks"
            placeholder="Search tasks..."
            placeholderTextColor={theme.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear task search"
              style={styles.clearButton}
              onPress={() => setQuery("")}
            >
              <Text style={styles.clearButtonText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.filterRow}>
        {(["upcoming", "overdue", "completed"] as const).map((item) => {
          const count = tasks.filter((task) =>
            matchesFilter(task, item, now, today),
          ).length;

          return (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ checked: filter === item }}
              aria-checked={filter === item}
              style={[
                styles.filterButton,
                filter === item ? styles.filterButtonActive : undefined,
              ]}
              onPress={() => setFilter(item)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item ? styles.filterTextActive : undefined,
                ]}
              >
                {capitalize(item)} ({count})
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.list}>
        {filtered.length > 0 ? (
          filtered.map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <View
                style={[
                  styles.kindDot,
                  { backgroundColor: kindColor(theme, task) },
                ]}
              />
              <View style={styles.taskCopy}>
                <Text
                  style={[
                    styles.taskTitle,
                    task.completedAt ? styles.taskTitleCompleted : undefined,
                  ]}
                >
                  {task.title}
                </Text>
                <Text style={styles.taskMeta}>{inboxTaskMeta(task)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${task.completedAt ? "View" : "Edit"} ${task.title} from inbox`}
                style={styles.actionButton}
                onPress={() => onEdit(task)}
              >
                <Text style={styles.actionText}>
                  {task.completedAt ? "View" : "Edit"}
                </Text>
              </Pressable>
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {query ? "No matching tasks" : emptyTitle(filter)}
            </Text>
            <Text style={styles.emptyText}>
              {query
                ? "Try another word or clear the search."
                : emptyDescription(filter)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function matchesFilter(
  task: Task,
  filter: InboxFilter,
  now: Date,
  today: string,
) {
  if (filter === "completed") return Boolean(task.completedAt);
  if (task.completedAt) return false;
  if (filter === "overdue") {
    return Boolean(task.dueAt && new Date(task.dueAt) < now);
  }
  return Boolean(
    (task.plannedFor && task.plannedFor > today) ||
      (task.dueAt && new Date(task.dueAt) >= now),
  );
}

function taskSortKey(task: Task) {
  return task.plannedFor ?? task.dueAt ?? task.updatedAt;
}

function inboxTaskMeta(task: Task) {
  const details: string[] = [];
  if (task.plannedFor) details.push(formatDate(task.plannedFor));
  if (task.scheduledTime) details.push(task.scheduledTime);
  if (task.recurrence) details.push(capitalize(task.recurrence.frequency));
  if (task.completedAt) details.push("Completed");
  return details.length > 0 ? details.join(" / ") : "No date attached";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function kindColor(theme: OrganaTheme, task: Task) {
  if (task.kind === "medication") return theme.must;
  if (task.kind === "habit") return theme.should;
  return theme.nice;
}

function emptyTitle(filter: InboxFilter) {
  if (filter === "overdue") return "Nothing overdue";
  if (filter === "completed") return "No completed tasks yet";
  return "Nothing upcoming";
}

function emptyDescription(filter: InboxFilter) {
  if (filter === "overdue") return "There is nothing asking you to catch up.";
  if (filter === "completed") return "Finished tasks will stay available here.";
  return "Future plans and due dates will appear here.";
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function createStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    wrap: {
      borderTopColor: theme.border,
      borderTopWidth: 1,
      marginTop: 30,
      paddingTop: 24,
    },
    heading: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 20,
      justifyContent: "space-between",
    },
    headingCompact: {
      alignItems: "stretch",
      flexDirection: "column",
    },
    eyebrow: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 1.5,
      marginBottom: 3,
    },
    title: {
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
      minWidth: 260,
    },
    searchWrapCompact: {
      minWidth: 0,
      width: "100%",
    },
    searchInput: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
      minHeight: 42,
      paddingHorizontal: 13,
    },
    clearButton: {
      paddingHorizontal: 11,
      paddingVertical: 9,
    },
    clearButtonText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 14,
    },
    filterButton: {
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterButtonActive: {
      backgroundColor: theme.shouldSoft,
      borderColor: theme.should,
    },
    filterText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    filterTextActive: {
      color: theme.should,
    },
    list: {
      gap: 7,
      marginTop: 12,
    },
    taskRow: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      padding: 12,
    },
    kindDot: {
      borderRadius: 5,
      height: 9,
      width: 9,
    },
    taskCopy: {
      flex: 1,
      minWidth: 0,
    },
    taskTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    taskTitleCompleted: {
      color: theme.textMuted,
      textDecorationLine: "line-through",
    },
    taskMeta: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 8,
      marginTop: 3,
    },
    actionButton: {
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    actionText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    empty: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      padding: 26,
    },
    emptyTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    emptyText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      marginTop: 5,
      textAlign: "center",
    },
  });
}
