import {
  buildDayPlan,
  formatLocalDate,
  type CreateTaskInput,
  type Task,
  type TaskPriority,
} from "@organa/domain";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useReducedMotion } from "../../accessibility/use-reduced-motion";
import { useAppTheme } from "../../components/app-shell";
import { keyboardAwareScrollProps } from "../../components/keyboard";
import { TextInput } from "../../components/themed-text-input";
import type { OrganaTheme } from "../../theme";
import { StyleSheet } from "../../typography";
import { PlanningCalendar } from "./planning-calendar";
import { TaskInbox } from "./task-inbox";
import { useTasks } from "./task-context";
import { TaskEditorModal } from "./task-editor-modal";
import {
  CompletionCollapse,
  COMPLETION_TRANSITION_MS,
} from "./completion-collapse";

const priorities: Array<{
  key: TaskPriority;
  label: string;
  hint: string;
}> = [
  { key: "must", label: "Must do", hint: "Keep the day steady" },
  { key: "should", label: "Should do", hint: "Helpful, not urgent" },
  { key: "nice", label: "Nice to do", hint: "Only if there is room" },
];

export function TodayScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const {
    loading,
    tasks,
    addTask,
    confirmDose,
    editTask,
    removeTask,
    toggleTask,
    toggleSubtask,
  } = useTasks();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("should");
  const [showCompleted, setShowCompleted] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task>();
  const actualToday = formatLocalDate(new Date());
  const [selectedDate, setSelectedDate] = useState(actualToday);
  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<string[]>(
    [],
  );
  const completionTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const plan = buildDayPlan(tasks, selectedDate);
  const recentlyCompleted = new Set(recentlyCompletedIds);
  const visibleLanes = {
    must: visibleTasksForLane(tasks, selectedDate, "must", recentlyCompleted),
    should: visibleTasksForLane(
      tasks,
      selectedDate,
      "should",
      recentlyCompleted,
    ),
    nice: visibleTasksForLane(tasks, selectedDate, "nice", recentlyCompleted),
  };
  const visibleTimed = tasks
    .filter(
      (task) =>
        task.plannedFor === selectedDate &&
        Boolean(task.scheduledTime) &&
        (!task.completedAt || recentlyCompleted.has(task.id)),
    )
    .sort((left, right) =>
      (left.scheduledTime ?? "").localeCompare(right.scheduledTime ?? ""),
    );
  const settledCompleted = plan.completed.filter(
    (task) => !recentlyCompleted.has(task.id),
  );
  const visibleTaskCount =
    visibleLanes.must.length +
    visibleLanes.should.length +
    visibleLanes.nice.length;
  const isWide = width >= 1180;
  const isCompact = width < 620;

  useEffect(() => {
    const timers = completionTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  function submitTask() {
    if (!title.trim()) return;
    addTask({ title, priority, plannedFor: selectedDate });
    setTitle("");
  }

  function openNewTask() {
    setEditingTask(undefined);
    setEditorVisible(true);
  }

  function openTask(task: Task) {
    setEditingTask(task);
    setEditorVisible(true);
  }

  function focusTask(task: Task) {
    router.push({ pathname: "/focus", params: { taskId: task.id } });
  }

  function closeEditor() {
    setEditorVisible(false);
    setEditingTask(undefined);
  }

  function saveEditor(input: CreateTaskInput, task?: Task) {
    if (task) {
      editTask(task, input);
    } else {
      addTask(input);
    }
    closeEditor();
  }

  function deleteFromEditor(task: Task) {
    removeTask(task.id);
    closeEditor();
  }

  function toggleTaskWithGrace(task: Task) {
    if (task.completedAt) {
      const timer = completionTimers.current.get(task.id);
      if (timer) {
        clearTimeout(timer);
        completionTimers.current.delete(task.id);
      }
      setRecentlyCompletedIds((current) =>
        current.filter((id) => id !== task.id),
      );
      toggleTask(task);
      return;
    }

    toggleTask(task);
    setRecentlyCompletedIds((current) =>
      current.includes(task.id) ? current : [...current, task.id],
    );
    const timer = setTimeout(() => {
      completionTimers.current.delete(task.id);
      setRecentlyCompletedIds((current) =>
        current.filter((id) => id !== task.id),
      );
    }, COMPLETION_TRANSITION_MS);
    completionTimers.current.set(task.id, timer);
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accentStrong} />
        <Text role="status" style={styles.loadingText}>
          Making space for today...
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
      <View style={[styles.hero, isCompact ? styles.heroCompact : undefined]}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>
            {formatFriendlyDate(parseLocalDate(selectedDate))}
          </Text>
          <Text role="heading" style={styles.title}>
            {selectedDate === actualToday
              ? "Make room for today."
              : "Plan with a little room."}
          </Text>
          <Text style={styles.subtitle}>
            A short list is still a real plan. Choose what feels possible.
          </Text>
        </View>
        <View style={styles.progressCard}>
          <Text style={styles.progressNumber}>{plan.completed.length}</Text>
          <Text style={styles.progressLabel}>gentle wins</Text>
        </View>
      </View>

      <PlanningCalendar
        selectedDate={selectedDate}
        tasks={tasks}
        onSelectDate={setSelectedDate}
      />

      <View style={[styles.board, isWide && styles.boardWide]}>
        <View style={styles.priorityColumn}>
          <SectionHeading
            styles={styles}
            eyebrow="PRIORITY LANE"
            title="What matters"
            count={visibleTaskCount}
          />
          <View style={styles.priorityStack}>
            {priorities.map((lane) => (
              <PriorityLane
                key={lane.key}
                hint={lane.hint}
                label={lane.label}
                priority={lane.key}
                styles={styles}
                tasks={visibleLanes[lane.key]}
                theme={theme}
                onEdit={openTask}
                onFocus={focusTask}
                onConfirmDose={confirmDose}
                onToggle={toggleTaskWithGrace}
                onToggleSubtask={toggleSubtask}
              />
            ))}
          </View>
        </View>

        <View style={styles.timeColumn}>
          <SectionHeading
            styles={styles}
            eyebrow="TIME LANE"
            title="Anchors"
            count={visibleTimed.length}
          />
          <View style={styles.timelineCard}>
            {visibleTimed.length > 0 ? (
              visibleTimed.map((task, index) => (
                <CompletionCollapse
                  key={task.id}
                  completed={Boolean(task.completedAt)}
                >
                  <View style={styles.timelineRow}>
                    <View style={styles.timelineTimeWrap}>
                      <Text style={styles.timelineTime}>
                        {task.scheduledTime}
                      </Text>
                      {index < visibleTimed.length - 1 ? (
                        <View style={styles.timelineLine} />
                      ) : null}
                    </View>
                    <TimelineTask
                      styles={styles}
                      task={task}
                      theme={theme}
                      onEdit={openTask}
                      onFocus={focusTask}
                      onConfirmDose={confirmDose}
                      onToggle={toggleTaskWithGrace}
                    />
                  </View>
                </CompletionCollapse>
              ))
            ) : (
              <View style={styles.emptyTime}>
                <Text style={styles.emptyTimeTitle}>No fixed times</Text>
                <Text style={styles.emptyTimeText}>
                  Your day has room to move. Scheduled tasks will appear here.
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <QuickAdd
        compact={isCompact}
        priority={priority}
        styles={styles}
        theme={theme}
        title={title}
        onChangePriority={setPriority}
        onChangeTitle={setTitle}
        onOpenEditor={openNewTask}
        onSubmit={submitTask}
      />

      <View style={styles.completedWrap}>
        <Pressable
          accessibilityRole="button"
          style={styles.completedHeader}
          onPress={() => setShowCompleted((current) => !current)}
        >
          <Text style={styles.completedTitle}>
            {selectedDate === actualToday ? "Completed today" : "Completed"}
            {" ("}
            {settledCompleted.length})
          </Text>
          <Text style={styles.completedToggle}>
            {showCompleted ? "Hide" : "Show"}
          </Text>
        </Pressable>
        {showCompleted ? (
          <View style={styles.completedList}>
            {settledCompleted.length > 0 ? (
              settledCompleted.map((task) => (
                <View key={task.id} style={styles.completedTask}>
                  <Pressable
                    accessibilityLabel={`Reopen ${task.title}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: true }}
                    aria-checked
                    style={styles.completedCheck}
                    onPress={() => toggleTaskWithGrace(task)}
                  >
                    <Text style={styles.completedCheckText}>✓</Text>
                  </Pressable>
                  <View style={styles.completedTaskCopy}>
                    <Text style={styles.completedTaskTitle}>{task.title}</Text>
                    <Text style={styles.reopenLabel}>
                      Select the checkmark to reopen
                    </Text>
                  </View>
                  <DoseConfirmationButton
                    styles={styles}
                    task={task}
                    onConfirm={confirmDose}
                  />
                </View>
              ))
            ) : (
              <Text style={styles.completedEmpty}>
                Nothing here yet. Starting counts, too.
              </Text>
            )}
          </View>
        ) : null}
      </View>
      <TaskInbox
        tasks={tasks}
        temporarilyVisibleTaskIds={recentlyCompletedIds}
        onEdit={openTask}
      />
      <TaskEditorModal
        defaultPlannedFor={selectedDate}
        task={editingTask}
        visible={editorVisible}
        onClose={closeEditor}
        onDelete={deleteFromEditor}
        onSave={saveEditor}
      />
    </ScrollView>
  );
}

function QuickAdd({
  compact,
  priority,
  styles,
  theme,
  title,
  onChangePriority,
  onChangeTitle,
  onOpenEditor,
  onSubmit,
}: {
  compact: boolean;
  priority: TaskPriority;
  styles: ReturnType<typeof createStyles>;
  theme: OrganaTheme;
  title: string;
  onChangePriority(priority: TaskPriority): void;
  onChangeTitle(title: string): void;
  onOpenEditor(): void;
  onSubmit(): void;
}) {
  return (
    <View style={styles.quickAdd}>
      <View style={styles.quickAddTop}>
        <View>
          <Text style={styles.quickAddEyebrow}>QUICK CAPTURE</Text>
          <Text style={styles.quickAddTitle}>What is on your mind?</Text>
        </View>
        <View style={styles.quickAddActions}>
          {!compact ? (
            <Text style={styles.quickAddHint}>Press enter to add</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            style={styles.planButton}
            onPress={onOpenEditor}
          >
            <Text style={styles.planButtonText}>Plan details</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel="New task title"
          enterKeyHint="done"
          placeholder="Add one small thing..."
          placeholderTextColor={theme.textMuted}
          returnKeyType="done"
          style={styles.input}
          value={title}
          onChangeText={onChangeTitle}
          onSubmitEditing={onSubmit}
        />
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.addButtonPressed,
          ]}
          onPress={onSubmit}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      <View style={styles.priorityChips}>
        {priorities.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: priority === item.key }}
            aria-checked={priority === item.key}
            style={[
              styles.priorityChip,
              priority === item.key && styles.priorityChipActive,
            ]}
            onPress={() => onChangePriority(item.key)}
          >
            <Text
              style={[
                styles.priorityChipText,
                priority === item.key && styles.priorityChipTextActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SectionHeading({
  count,
  eyebrow,
  styles,
  title,
}: {
  count: number;
  eyebrow: string;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.countPill}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    </View>
  );
}

function PriorityLane({
  hint,
  label,
  priority,
  styles,
  tasks,
  theme,
  onEdit,
  onFocus,
  onConfirmDose,
  onToggle,
  onToggleSubtask,
}: {
  hint: string;
  label: string;
  priority: TaskPriority;
  styles: ReturnType<typeof createStyles>;
  tasks: Task[];
  theme: OrganaTheme;
  onEdit(task: Task): void;
  onFocus(task: Task): void;
  onConfirmDose(task: Task): void;
  onToggle(task: Task): void;
  onToggleSubtask(task: Task, subtaskId: string): void;
}) {
  const colors = priorityColors(theme, priority);

  return (
    <View style={[styles.lane, { backgroundColor: colors.soft }]}>
      <View style={styles.laneHeader}>
        <View style={[styles.laneDot, { backgroundColor: colors.strong }]} />
        <View style={styles.laneHeaderCopy}>
          <Text style={styles.laneTitle}>{label}</Text>
          <Text style={styles.laneHint}>{hint}</Text>
        </View>
        <Text style={[styles.laneCount, { color: colors.strong }]}>
          {tasks.length}
        </Text>
      </View>
      <View style={styles.taskList}>
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <PriorityTask
              key={task.id}
              colors={colors}
              styles={styles}
              task={task}
              onEdit={onEdit}
              onFocus={onFocus}
              onConfirmDose={onConfirmDose}
              onToggle={onToggle}
              onToggleSubtask={onToggleSubtask}
            />
          ))
        ) : (
          <Text style={styles.emptyLane}>Nothing asking for attention.</Text>
        )}
      </View>
    </View>
  );
}

function PriorityTask({
  colors,
  styles,
  task,
  onEdit,
  onFocus,
  onConfirmDose,
  onToggle,
  onToggleSubtask,
}: {
  colors: ReturnType<typeof priorityColors>;
  styles: ReturnType<typeof createStyles>;
  task: Task;
  onEdit(task: Task): void;
  onFocus(task: Task): void;
  onConfirmDose(task: Task): void;
  onToggle(task: Task): void;
  onToggleSubtask(task: Task, subtaskId: string): void;
}) {
  const fade = useCompletionFade(Boolean(task.completedAt));

  return (
    <CompletionCollapse completed={Boolean(task.completedAt)}>
      <View style={styles.taskRow}>
        <Animated.View style={[styles.taskMain, { opacity: fade }]}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={task.title}
            accessibilityState={{ checked: Boolean(task.completedAt) }}
            aria-checked={Boolean(task.completedAt)}
            style={({ pressed }) => [
              styles.taskCheck,
              { borderColor: colors.strong },
              task.completedAt
                ? { backgroundColor: colors.strong }
                : undefined,
              pressed ? styles.taskCheckPressed : undefined,
            ]}
            onPress={() => onToggle(task)}
          >
            {task.completedAt ? (
              <Text style={styles.taskCheckText}>✓</Text>
            ) : null}
          </Pressable>
          <View style={styles.taskContent}>
            <View style={styles.taskCopy}>
              <Text
                style={[
                  styles.taskTitle,
                  task.completedAt ? styles.taskTitleCompleted : undefined,
                ]}
              >
                {task.title}
              </Text>
              <Text
                style={[
                  styles.taskMeta,
                  task.completedAt ? styles.taskMetaCompleted : undefined,
                ]}
              >
                {formatTaskMeta(task)}
              </Text>
            </View>
            {task.subtasks.length > 0 ? (
              <View style={styles.subtaskList}>
                {task.subtasks.map((subtask) => (
                  <View key={subtask.id} style={styles.subtaskItem}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityLabel={subtask.title}
                      accessibilityState={{
                        checked: Boolean(subtask.completedAt),
                      }}
                      aria-checked={Boolean(subtask.completedAt)}
                      disabled={Boolean(task.completedAt)}
                      style={[
                        styles.subtaskCheck,
                        subtask.completedAt
                          ? { backgroundColor: colors.strong }
                          : { borderColor: colors.strong },
                      ]}
                      onPress={() => onToggleSubtask(task, subtask.id)}
                    >
                      {subtask.completedAt ? (
                        <Text style={styles.subtaskCheckText}>✓</Text>
                      ) : null}
                    </Pressable>
                    <Text
                      style={[
                        styles.subtaskItemTitle,
                        subtask.completedAt
                          ? styles.subtaskItemTitleCompleted
                          : undefined,
                      ]}
                    >
                      {subtask.title}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Animated.View>
        {task.completedAt ? (
          <View style={styles.completedActions}>
            <DoseConfirmationButton
              styles={styles}
              task={task}
              onConfirm={onConfirmDose}
            />
            <UndoButton styles={styles} task={task} onToggle={onToggle} />
          </View>
        ) : (
          <View style={styles.taskActions}>
            <Text style={[styles.taskKind, { color: colors.strong }]}>
              {formatKind(task.kind)}
            </Text>
            <EditButton styles={styles} task={task} onEdit={onEdit} />
            <FocusButton styles={styles} task={task} onFocus={onFocus} />
          </View>
        )}
      </View>
    </CompletionCollapse>
  );
}

function TimelineTask({
  styles,
  task,
  theme,
  onEdit,
  onFocus,
  onConfirmDose,
  onToggle,
}: {
  styles: ReturnType<typeof createStyles>;
  task: Task;
  theme: OrganaTheme;
  onEdit(task: Task): void;
  onFocus(task: Task): void;
  onConfirmDose(task: Task): void;
  onToggle(task: Task): void;
}) {
  const fade = useCompletionFade(Boolean(task.completedAt));

  return (
    <View style={styles.timelineTask}>
      <Animated.View style={[styles.timelineTaskMain, { opacity: fade }]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={task.title}
          accessibilityState={{ checked: Boolean(task.completedAt) }}
          aria-checked={Boolean(task.completedAt)}
          style={({ pressed }) => [
            styles.taskCheck,
            { borderColor: theme.accentStrong },
            task.completedAt
              ? { backgroundColor: theme.accentStrong }
              : undefined,
            pressed ? styles.taskCheckPressed : undefined,
          ]}
          onPress={() => onToggle(task)}
        >
          {task.completedAt ? (
            <Text style={styles.taskCheckText}>✓</Text>
          ) : null}
        </Pressable>
        <View style={styles.timelineTaskCopy}>
          <Text
            style={[
              styles.timelineTaskTitle,
              task.completedAt
                ? styles.timelineTaskTitleCompleted
                : undefined,
            ]}
          >
            {task.title}
          </Text>
          <Text style={styles.timelineTaskMeta}>{formatTaskMeta(task)}</Text>
        </View>
      </Animated.View>
      {task.completedAt ? (
        <View style={styles.completedActions}>
          <DoseConfirmationButton
            styles={styles}
            task={task}
            onConfirm={onConfirmDose}
          />
          <UndoButton styles={styles} task={task} onToggle={onToggle} />
        </View>
      ) : (
        <View style={styles.taskActions}>
          <EditButton styles={styles} task={task} onEdit={onEdit} />
          <FocusButton styles={styles} task={task} onFocus={onFocus} />
        </View>
      )}
    </View>
  );
}

function FocusButton({
  styles,
  task,
  onFocus,
}: {
  styles: ReturnType<typeof createStyles>;
  task: Task;
  onFocus(task: Task): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Focus on ${task.title}`}
      style={styles.focusButton}
      onPress={() => onFocus(task)}
    >
      <Text style={styles.focusButtonText}>Focus</Text>
    </Pressable>
  );
}

function EditButton({
  styles,
  task,
  onEdit,
}: {
  styles: ReturnType<typeof createStyles>;
  task: Task;
  onEdit(task: Task): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${task.title}`}
      style={styles.editButton}
      onPress={() => onEdit(task)}
    >
      <Text style={styles.editButtonText}>Edit</Text>
    </Pressable>
  );
}

function UndoButton({
  styles,
  task,
  onToggle,
}: {
  styles: ReturnType<typeof createStyles>;
  task: Task;
  onToggle(task: Task): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Undo ${task.title}`}
      style={styles.undoButton}
      onPress={() => onToggle(task)}
    >
      <Text style={styles.undoButtonText}>Undo</Text>
    </Pressable>
  );
}

function DoseConfirmationButton({
  styles,
  task,
  onConfirm,
}: {
  styles: ReturnType<typeof createStyles>;
  task: Task;
  onConfirm(task: Task): void;
}) {
  if (task.kind !== "medication" || !task.requireDoseConfirmation) {
    return null;
  }

  if (task.doseConfirmedAt) {
    return (
      <Text
        accessibilityLabel="Medication dose confirmed"
        style={styles.doseConfirmed}
      >
        Dose confirmed
      </Text>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Confirm dose for ${task.title}`}
      style={styles.doseButton}
      onPress={() => onConfirm(task)}
    >
      <Text style={styles.doseButtonText}>Confirm dose</Text>
    </Pressable>
  );
}

function useCompletionFade(completed: boolean) {
  const fade = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    fade.stopAnimation();

    if (!completed) {
      fade.setValue(1);
      return;
    }

    fade.setValue(1);
    if (reducedMotion) {
      fade.setValue(0.55);
      return;
    }
    Animated.timing(fade, {
      duration: COMPLETION_TRANSITION_MS - 100,
      easing: Easing.linear,
      toValue: 0.25,
      useNativeDriver: false,
    }).start();

    return () => fade.stopAnimation();
  }, [completed, fade, reducedMotion]);

  return fade;
}

function visibleTasksForLane(
  tasks: Task[],
  date: string,
  priority: TaskPriority,
  recentlyCompleted: Set<string>,
) {
  return tasks.filter(
    (task) =>
      task.plannedFor === date &&
      task.priority === priority &&
      (!task.completedAt || recentlyCompleted.has(task.id)),
  );
}

function formatFriendlyDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatKind(kind: Task["kind"]) {
  if (kind === "medication") return "Medication";
  if (kind === "habit") return "Routine";
  return "Task";
}

function formatTaskMeta(task: Task) {
  const details: string[] = [];
  if (task.scheduledTime) details.push(task.scheduledTime);
  if (task.estimatedMinutes) details.push(`${task.estimatedMinutes} min`);
  if (task.recurrence) details.push(capitalize(task.recurrence.frequency));
  if (task.subtasks.length > 0) {
    const completedSteps = task.subtasks.filter(
      (item) => item.completedAt,
    ).length;
    details.push(`${completedSteps}/${task.subtasks.length} steps`);
  }
  if (details.length === 0) return "No fixed time";
  return details.join(" / ");
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function priorityColors(theme: OrganaTheme, priority: TaskPriority) {
  if (priority === "must") {
    return { strong: theme.must, soft: theme.mustSoft };
  }
  if (priority === "nice") {
    return { strong: theme.nice, soft: theme.niceSoft };
  }
  return { strong: theme.should, soft: theme.shouldSoft };
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
      maxWidth: 1560,
      paddingBottom: 60,
      paddingHorizontal: 24,
      paddingTop: 30,
      width: "100%",
    },
    pageCompact: {
      alignSelf: "stretch",
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    hero: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 20,
      justifyContent: "space-between",
      marginBottom: 26,
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
      marginBottom: 8,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 34,
      letterSpacing: -1.5,
      lineHeight: 40,
    },
    subtitle: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
      maxWidth: 530,
    },
    progressCard: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      minWidth: 96,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    progressNumber: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 24,
    },
    progressLabel: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
    },
    quickAdd: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 22,
      borderWidth: 1,
      marginBottom: 28,
      padding: 20,
    },
    quickAddTop: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    quickAddEyebrow: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
      letterSpacing: 1.5,
      marginBottom: 3,
    },
    quickAddTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 15,
    },
    quickAddHint: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 10,
    },
    quickAddActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    planButton: {
      backgroundColor: theme.shouldSoft,
      borderColor: theme.should,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    planButtonText: {
      color: theme.should,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    inputRow: {
      flexDirection: "row",
      gap: 10,
    },
    input: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 14,
      minHeight: 48,
      paddingHorizontal: 16,
    },
    addButton: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 22,
    },
    addButtonPressed: {
      opacity: 0.82,
    },
    addButtonText: {
      color: theme.background,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 13,
    },
    priorityChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    priorityChip: {
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    priorityChipActive: {
      backgroundColor: theme.shouldSoft,
      borderColor: theme.should,
    },
    priorityChipText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
    },
    priorityChipTextActive: {
      color: theme.text,
    },
    board: {
      gap: 28,
    },
    boardWide: {
      alignItems: "flex-start",
      flexDirection: "row",
    },
    priorityColumn: {
      flex: 1.65,
      minWidth: 0,
    },
    timeColumn: {
      flex: 1,
      minWidth: 0,
    },
    sectionHeading: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    sectionEyebrow: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.6,
      marginBottom: 3,
    },
    sectionTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 21,
      letterSpacing: -0.7,
    },
    countPill: {
      alignItems: "center",
      backgroundColor: theme.surfaceMuted,
      borderRadius: 14,
      height: 28,
      justifyContent: "center",
      width: 36,
    },
    countText: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    priorityStack: {
      gap: 12,
    },
    lane: {
      borderRadius: 18,
      padding: 15,
    },
    laneHeader: {
      alignItems: "center",
      flexDirection: "row",
      marginBottom: 11,
    },
    laneDot: {
      borderRadius: 5,
      height: 9,
      marginRight: 10,
      width: 9,
    },
    laneHeaderCopy: {
      flex: 1,
    },
    laneTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 13,
    },
    laneHint: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 10,
      marginTop: 1,
    },
    laneCount: {
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 12,
    },
    taskList: {
      gap: 7,
      minHeight: 58,
    },
    taskRow: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderRadius: 13,
      flexDirection: "row",
      gap: 10,
      minHeight: 58,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    taskMain: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 11,
      minWidth: 0,
    },
    taskCheck: {
      alignItems: "center",
      borderRadius: 8,
      borderWidth: 1.5,
      height: 23,
      justifyContent: "center",
      width: 23,
    },
    taskCheckPressed: {
      opacity: 0.72,
    },
    taskCheckText: {
      color: theme.background,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 7,
    },
    taskCopy: {
      flex: 1,
      minWidth: 0,
    },
    taskContent: {
      flex: 1,
      minWidth: 0,
    },
    taskTitle: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
    },
    taskTitleCompleted: {
      color: theme.textMuted,
      textDecorationLine: "line-through",
    },
    taskMeta: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      marginTop: 3,
    },
    taskMetaCompleted: {
      textDecorationLine: "line-through",
    },
    taskKind: {
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    taskActions: {
      alignItems: "flex-end",
      gap: 6,
      justifyContent: "center",
      minHeight: 70,
      minWidth: 64,
    },
    completedActions: {
      alignItems: "flex-end",
      gap: 6,
      justifyContent: "center",
      minHeight: 70,
      minWidth: 64,
    },
    doseButton: {
      backgroundColor: theme.mustSoft,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    doseButtonText: {
      color: theme.must,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
    },
    doseConfirmed: {
      color: theme.should,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    editButton: {
      borderColor: theme.border,
      borderRadius: 9,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    editButtonText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    focusButton: {
      backgroundColor: theme.shouldSoft,
      borderRadius: 9,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    focusButtonText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    subtaskList: {
      gap: 6,
      marginTop: 9,
    },
    subtaskItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    subtaskCheck: {
      alignItems: "center",
      borderRadius: 5,
      borderWidth: 1,
      height: 17,
      justifyContent: "center",
      width: 17,
    },
    subtaskCheckText: {
      color: theme.background,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 6,
    },
    subtaskItemTitle: {
      color: theme.textMuted,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
    },
    subtaskItemTitleCompleted: {
      textDecorationLine: "line-through",
    },
    undoButton: {
      backgroundColor: theme.surfaceMuted,
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    undoButtonText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
    },
    emptyLane: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 11,
      paddingHorizontal: 4,
      paddingVertical: 7,
    },
    timelineCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      padding: 18,
    },
    timelineRow: {
      alignItems: "stretch",
      flexDirection: "row",
      gap: 12,
      minHeight: 78,
    },
    timelineTimeWrap: {
      alignItems: "center",
      width: 48,
    },
    timelineTime: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
      marginTop: 4,
    },
    timelineLine: {
      backgroundColor: theme.border,
      flex: 1,
      marginVertical: 8,
      width: 1,
    },
    timelineTask: {
      alignItems: "center",
      backgroundColor: theme.surfaceMuted,
      borderRadius: 14,
      flex: 1,
      flexDirection: "row",
      gap: 10,
      marginBottom: 10,
      padding: 13,
    },
    timelineTaskMain: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 10,
      minWidth: 0,
    },
    timelineTaskCopy: {
      flex: 1,
      minWidth: 0,
    },
    timelineTaskTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    timelineTaskTitleCompleted: {
      color: theme.textMuted,
      textDecorationLine: "line-through",
    },
    timelineTaskMeta: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      marginTop: 4,
    },
    emptyTime: {
      paddingHorizontal: 4,
      paddingVertical: 18,
    },
    emptyTimeTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 13,
    },
    emptyTimeText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 5,
    },
    completedWrap: {
      borderTopColor: theme.border,
      borderTopWidth: 1,
      marginTop: 30,
      paddingTop: 14,
    },
    completedHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
    },
    completedTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    completedToggle: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
    },
    completedList: {
      gap: 7,
      paddingTop: 7,
    },
    completedTask: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderRadius: 12,
      flexDirection: "row",
      gap: 10,
      padding: 11,
    },
    completedTaskCopy: {
      flex: 1,
      minWidth: 0,
    },
    completedCheck: {
      alignItems: "center",
      backgroundColor: theme.shouldSoft,
      borderRadius: 8,
      height: 24,
      justifyContent: "center",
      width: 24,
    },
    completedCheckText: {
      color: theme.should,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 7,
    },
    completedTaskTitle: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
      textDecorationLine: "line-through",
    },
    reopenLabel: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
      marginTop: 2,
    },
    completedEmpty: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 11,
      paddingVertical: 10,
    },
  });
}
