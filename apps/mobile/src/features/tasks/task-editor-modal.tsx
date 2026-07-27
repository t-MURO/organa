import {
  canTaskKindRepeat,
  formatLocalDate,
  type CreateTaskInput,
  type Reminder,
  type Task,
  type TaskKind,
  type TaskPriority,
  type TaskRecurrence,
  type TaskSubtask,
} from "@organa/domain";
import { useEffect, useState } from "react";
import {
  Modal,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useReducedMotion } from "../../accessibility/use-reduced-motion";
import { useAppTheme } from "../../components/app-shell";
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView,
} from "../../components/keyboard";
import { TextInput } from "../../components/themed-text-input";
import { notificationCapability } from "../../data/create-notification-scheduler";
import type { OrganaTheme } from "../../theme";
import { StyleSheet } from "../../typography";
import {
  createTaskDeadline,
  materializeInheritedSubtaskReminders,
  readTaskDeadline,
} from "./task-editor-model";
import { DatePickerField } from "./task-date-picker";
import { TimePickerField } from "./task-time-picker";

const taskKinds: Array<{ value: TaskKind; label: string; hint: string }> = [
  { value: "one_off", label: "One-off", hint: "A task to finish once" },
  { value: "habit", label: "Routine", hint: "Something that repeats" },
  {
    value: "medication",
    label: "Medication",
    hint: "Organization support only",
  },
];

const priorities: Array<{ value: TaskPriority; label: string }> = [
  { value: "must", label: "Must do" },
  { value: "should", label: "Should do" },
  { value: "nice", label: "Nice to do" },
];

const reminderOptions = [
  { id: "before", label: "15 min before", stage: "before_due", offset: 15 },
  { id: "at", label: "At due time", stage: "at_due", offset: 0 },
  { id: "after", label: "30 min after", stage: "after_due", offset: 30 },
] as const;

const snoozeOptions = [5, 10, 30, 60];
const durationOptions = [5, 10, 15, 30, 60];
const weekdayOptions = [
  { label: "Monday", shortLabel: "Mon", value: 1 },
  { label: "Tuesday", shortLabel: "Tue", value: 2 },
  { label: "Wednesday", shortLabel: "Wed", value: 3 },
  { label: "Thursday", shortLabel: "Thu", value: 4 },
  { label: "Friday", shortLabel: "Fri", value: 5 },
  { label: "Saturday", shortLabel: "Sat", value: 6 },
  { label: "Sunday", shortLabel: "Sun", value: 0 },
];

export function TaskEditorModal({
  defaultPlannedFor,
  task,
  visible,
  onClose,
  onDelete,
  onSave,
}: {
  defaultPlannedFor: string;
  task?: Task;
  visible: boolean;
  onClose(): void;
  onDelete(task: Task): void;
  onSave(input: CreateTaskInput, task?: Task): void;
}) {
  const theme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [kind, setKind] = useState<TaskKind>("one_off");
  const [priority, setPriority] = useState<TaskPriority>("should");
  const [plannedFor, setPlannedFor] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [duration, setDuration] = useState("");
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [frequency, setFrequency] =
    useState<TaskRecurrence["frequency"]>("daily");
  const [interval, setInterval] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [selectedReminders, setSelectedReminders] = useState<string[]>(["at"]);
  const [snoozePresets, setSnoozePresets] = useState<number[]>([10, 30, 60]);
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [subtaskRemindersEnabled, setSubtaskRemindersEnabled] =
    useState(false);
  const [graceDays, setGraceDays] = useState(3);
  const [requireDoseConfirmation, setRequireDoseConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const deadline = readTaskDeadline(task);
    setTitle(task?.title ?? "");
    setDetails(task?.details ?? "");
    setKind(task?.kind ?? "one_off");
    setPriority(task?.priority ?? "should");
    setPlannedFor(task?.plannedFor ?? defaultPlannedFor);
    setScheduledTime(task?.scheduledTime ?? "");
    setDueDate(task ? deadline.dueDate : formatLocalDate(new Date()));
    setDueTime(deadline.dueTime);
    setDuration(task?.estimatedMinutes?.toString() ?? "");
    setRecurrenceEnabled(
      Boolean(task?.recurrence) && canTaskKindRepeat(task?.kind),
    );
    setFrequency(task?.recurrence?.frequency ?? "daily");
    setInterval(task?.recurrence?.interval ?? 1);
    setWeekdays(
      task?.recurrence?.weekdays ?? [
        weekdayForLocalDate(task?.plannedFor ?? defaultPlannedFor),
      ],
    );
    setSelectedReminders(
      task
        ? reminderOptions
            .filter((option) =>
              task.reminders.some(
                (reminder) =>
                  reminder.stage === option.stage &&
                  reminder.offsetMinutes === option.offset,
              ),
            )
            .map((option) => option.id)
        : ["at"],
    );
    setSnoozePresets(task?.snoozePresets ?? [10, 30, 60]);
    setSubtasks(
      task?.subtasks.map((subtask) =>
        task.subtaskRemindersEnabled && subtask.reminders === undefined
          ? { ...subtask, reminders: task.reminders }
          : subtask,
      ) ?? [],
    );
    setSubtaskDraft("");
    setSubtaskRemindersEnabled(task?.subtaskRemindersEnabled ?? false);
    setGraceDays(task?.graceDays ?? 3);
    setRequireDoseConfirmation(task?.requireDoseConfirmation ?? false);
    setError("");
    setConfirmDelete(false);
  }, [defaultPlannedFor, task, visible]);

  function selectKind(nextKind: TaskKind) {
    setKind(nextKind);
    if (!canTaskKindRepeat(nextKind)) {
      setRecurrenceEnabled(false);
    } else if (!recurrenceEnabled) {
      setRecurrenceEnabled(true);
    }
  }

  function toggleReminder(id: string) {
    setSelectedReminders((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSnooze(minutes: number) {
    setSnoozePresets((current) =>
      current.includes(minutes)
        ? current.filter((item) => item !== minutes)
        : [...current, minutes].sort((left, right) => left - right),
    );
  }

  function selectFrequency(nextFrequency: TaskRecurrence["frequency"]) {
    setFrequency(nextFrequency);
    if (nextFrequency === "weekly" && weekdays.length === 0) {
      setWeekdays([weekdayForLocalDate(plannedFor || defaultPlannedFor)]);
    }
  }

  function toggleWeekday(weekday: number) {
    setWeekdays((current) => {
      if (!current.includes(weekday)) {
        return [...current, weekday].sort((left, right) => left - right);
      }
      return current.length === 1
        ? current
        : current.filter((item) => item !== weekday);
    });
  }

  function addSubtask() {
    const nextTitle = subtaskDraft.trim();
    if (!nextTitle) return;

    setSubtasks((current) => [
      ...current,
      {
        id: `step-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        reminders: [],
        title: nextTitle,
      },
    ]);
    setSubtaskDraft("");
  }

  function toggleSubtaskReminder(subtaskId: string, optionId: string) {
    const option = reminderOptions.find((item) => item.id === optionId);
    if (!option) return;

    setSubtasks((current) =>
      current.map((subtask) => {
        if (subtask.id !== subtaskId) return subtask;
        const reminders = subtask.reminders ?? [];
        const matches = (reminder: Reminder) =>
          reminder.stage === option.stage &&
          reminder.offsetMinutes === option.offset;
        return {
          ...subtask,
          reminders: reminders.some(matches)
            ? reminders.filter((reminder) => !matches(reminder))
            : [
                ...reminders,
                {
                  enabled: true,
                  id: `subtask-${option.stage}-${option.offset}`,
                  offsetMinutes: option.offset,
                  stage: option.stage,
                },
              ],
        };
      }),
    );
  }

  function toggleSubtaskReminderConfiguration() {
    if (!subtaskRemindersEnabled) {
      setSubtasks((current) =>
        materializeInheritedSubtaskReminders(
          current,
          remindersFromSelection(selectedReminders),
        ),
      );
    }
    setSubtaskRemindersEnabled((current) => !current);
  }

  function submit() {
    setError("");
    if (!title.trim()) {
      setError("Give this task a short title.");
      return;
    }
    if (plannedFor && !isValidDate(plannedFor)) {
      setError("Use YYYY-MM-DD for the planned date.");
      return;
    }
    if (scheduledTime && !isValidTime(scheduledTime)) {
      setError("Use HH:MM for the scheduled time.");
      return;
    }
    if (scheduledTime && !plannedFor) {
      setError("A scheduled time also needs a planned date.");
      return;
    }
    if (dueDate && !isValidDate(dueDate)) {
      setError("Use YYYY-MM-DD for the due date.");
      return;
    }
    if (dueTime && !isValidTime(dueTime)) {
      setError("Use HH:MM for the due time.");
      return;
    }
    if (dueTime && !dueDate) {
      setError("A due time also needs a due date.");
      return;
    }
    const estimatedMinutes = duration ? Number(duration) : undefined;
    if (
      estimatedMinutes !== undefined &&
      (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0)
    ) {
      setError("Duration must be a positive number of minutes.");
      return;
    }

    const reminders: Reminder[] =
      dueDate && dueTime
        ? remindersFromSelection(selectedReminders)
        : [];
    const deadline = createTaskDeadline(dueDate, dueTime);

    onSave(
      {
        title,
        details,
        kind,
        priority,
        plannedFor: plannedFor || undefined,
        scheduledTime: scheduledTime || undefined,
        ...deadline,
        estimatedMinutes,
        recurrence: canTaskKindRepeat(kind) && recurrenceEnabled
          ? {
              frequency,
              interval,
              weekdays: frequency === "weekly" ? weekdays : undefined,
            }
          : undefined,
        reminders,
        subtasks,
        snoozePresets,
        graceDays:
          canTaskKindRepeat(kind) && recurrenceEnabled
            ? graceDays
            : undefined,
        requireDoseConfirmation:
          kind === "medication" ? requireDoseConfirmation : undefined,
        subtaskRemindersEnabled,
      },
      task,
    );
  }

  return (
    <Modal
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        style={[
          styles.overlay,
          compact ? styles.overlayCompact : undefined,
        ]}
      >
        <View
          style={[styles.modal, compact ? styles.modalCompact : undefined]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>
                {task ? "EDIT TASK" : "PLAN A TASK"}
              </Text>
              <Text style={styles.title}>
                {task ? "Adjust what you need." : "Give it a little shape."}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close task editor"
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.form}
          >
            <Section
              styles={styles}
              eyebrow="THE TASK"
              title="What needs attention?"
            >
              <FieldLabel styles={styles} label="Title" />
              <TextInput
                accessibilityLabel="Task title"
                autoFocus={!task}
                placeholder="Name the next clear action..."
                placeholderTextColor={theme.textMuted}
                style={styles.input}
                value={title}
                onChangeText={setTitle}
              />
              <FieldLabel styles={styles} label="Details" optional />
              <TextInput
                accessibilityLabel="Task details"
                multiline
                placeholder="Context, notes, or what done looks like."
                placeholderTextColor={theme.textMuted}
                style={[styles.input, styles.detailsInput]}
                textAlignVertical="top"
                value={details}
                onChangeText={setDetails}
              />
            </Section>

            <Section
              styles={styles}
              eyebrow="TYPE"
              title="How should Organa treat it?"
            >
              <View
                style={[
                  styles.kindGrid,
                  compact ? styles.kindGridCompact : undefined,
                ]}
              >
                {taskKinds.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: kind === option.value }}
                    aria-checked={kind === option.value}
                    style={[
                      styles.kindCard,
                      kind === option.value ? styles.kindCardActive : undefined,
                    ]}
                    onPress={() => selectKind(option.value)}
                  >
                    <Text style={styles.kindLabel}>{option.label}</Text>
                    <Text style={styles.kindHint}>{option.hint}</Text>
                  </Pressable>
                ))}
              </View>
              {kind === "medication" ? (
                <View style={styles.infoNote}>
                  <Text style={styles.infoNoteText}>
                    Medication features are organizational aids, not medical
                    advice or a substitute for professional care.
                  </Text>
                </View>
              ) : null}
            </Section>

            <Section
              styles={styles}
              eyebrow="PLACEMENT"
              title="Where does it fit?"
            >
              <FieldLabel styles={styles} label="Priority" />
              <View style={styles.chipRow}>
                {priorities.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    active={priority === option.value}
                    label={option.label}
                    styles={styles}
                    onPress={() => setPriority(option.value)}
                  />
                ))}
              </View>
              <View
                style={[
                  styles.fieldGrid,
                  compact ? styles.fieldGridCompact : undefined,
                ]}
              >
                <View
                  style={[
                    styles.fieldCell,
                    compact ? styles.fieldCellCompact : undefined,
                  ]}
                >
                  <FieldLabel
                    styles={styles}
                    label="Planned date"
                    optional
                  />
                  <DatePickerField
                    accessibilityLabel="Task planned date"
                    value={plannedFor}
                    onChange={setPlannedFor}
                  />
                </View>
                <View
                  style={[
                    styles.fieldCell,
                    compact ? styles.fieldCellCompact : undefined,
                  ]}
                >
                  <FieldLabel
                    styles={styles}
                    label="Scheduled time"
                    optional
                  />
                  <TimePickerField
                    accessibilityLabel="Task scheduled time"
                    value={scheduledTime}
                    onChange={setScheduledTime}
                  />
                </View>
                <View
                  style={[
                    styles.fieldCell,
                    compact ? styles.fieldCellCompact : undefined,
                  ]}
                >
                  <FieldLabel styles={styles} label="Due date" optional />
                  <DatePickerField
                    accessibilityLabel="Task due date"
                    value={dueDate}
                    onChange={setDueDate}
                  />
                </View>
                <View
                  style={[
                    styles.fieldCell,
                    compact ? styles.fieldCellCompact : undefined,
                  ]}
                >
                  <FieldLabel styles={styles} label="Due time" optional />
                  <TimePickerField
                    accessibilityLabel="Task due time"
                    value={dueTime}
                    onChange={setDueTime}
                  />
                </View>
              </View>
              <FieldLabel styles={styles} label="Estimated duration" optional />
              <View style={styles.chipRow}>
                {durationOptions.map((minutes) => (
                  <ChoiceChip
                    key={minutes}
                    accessibilityLabel={`Set duration to ${minutes} minutes`}
                    active={duration === minutes.toString()}
                    label={`${minutes} min`}
                    styles={styles}
                    onPress={() => setDuration(minutes.toString())}
                  />
                ))}
                <TextInput
                  accessibilityLabel="Custom duration in minutes"
                  inputMode="numeric"
                  placeholder="Other"
                  placeholderTextColor={theme.textMuted}
                  style={styles.smallInput}
                  value={
                    durationOptions.includes(Number(duration)) ? "" : duration
                  }
                  onChangeText={setDuration}
                />
              </View>
            </Section>

            <Section
              styles={styles}
              eyebrow="REPEAT"
              title="Should it come back?"
            >
              {canTaskKindRepeat(kind) ? (
                <ToggleRow
                  active={recurrenceEnabled}
                  label="Repeat this task"
                  styles={styles}
                  onPress={() => setRecurrenceEnabled((current) => !current)}
                />
              ) : (
                <Text style={styles.sectionHint}>
                  Choose Routine or Medication when this task should repeat.
                </Text>
              )}
              {canTaskKindRepeat(kind) && recurrenceEnabled ? (
                <>
                  <View style={styles.chipRow}>
                    {(["daily", "weekly", "monthly"] as const).map((item) => (
                      <ChoiceChip
                        key={item}
                        active={frequency === item}
                        label={capitalize(item)}
                        styles={styles}
                        onPress={() => selectFrequency(item)}
                      />
                    ))}
                  </View>
                  <FieldLabel styles={styles} label="Repeat every" />
                  <View style={styles.chipRow}>
                    {[1, 2, 3, 4].map((value) => (
                      <ChoiceChip
                        key={value}
                        active={interval === value}
                        label={`${value} ${frequencyUnit(frequency, value)}`}
                        styles={styles}
                        onPress={() => setInterval(value)}
                      />
                    ))}
                  </View>
                  {frequency === "weekly" ? (
                    <>
                      <FieldLabel styles={styles} label="Repeat on" />
                      <View style={styles.chipRow}>
                        {weekdayOptions.map((option) => (
                          <ChoiceChip
                            key={option.value}
                            accessibilityLabel={`Repeat on ${option.label}`}
                            active={weekdays.includes(option.value)}
                            label={option.shortLabel}
                            role="checkbox"
                            styles={styles}
                            onPress={() => toggleWeekday(option.value)}
                          />
                        ))}
                      </View>
                    </>
                  ) : null}
                </>
              ) : null}
              {canTaskKindRepeat(kind) && recurrenceEnabled ? (
                <>
                  <FieldLabel styles={styles} label="Grace days" />
                  <View style={styles.chipRow}>
                    {[0, 1, 2, 3].map((days) => (
                      <ChoiceChip
                        key={days}
                        active={graceDays === days}
                        label={days === 0 ? "None" : days.toString()}
                        styles={styles}
                        onPress={() => setGraceDays(days)}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              {kind === "medication" ? (
                <ToggleRow
                  active={requireDoseConfirmation}
                  label="Ask for optional dose confirmation"
                  styles={styles}
                  onPress={() =>
                    setRequireDoseConfirmation((current) => !current)
                  }
                />
              ) : null}
            </Section>

            <Section
              styles={styles}
              eyebrow="REMINDERS"
              title="How should it nudge you?"
            >
              <Text style={styles.sectionHint}>
                Reminders need a due date and time before notifications can be
                scheduled.
              </Text>
              <View style={styles.capabilityNotice}>
                <Text style={styles.capabilityLabel}>
                  {notificationCapability.label}
                </Text>
                <Text style={styles.capabilityText}>
                  {notificationCapability.reason ??
                    "Scheduled on this device and available offline."}
                </Text>
              </View>
              <View style={styles.chipRow}>
                {reminderOptions.map((option) => (
                  <ChoiceChip
                    key={option.id}
                    active={selectedReminders.includes(option.id)}
                    label={option.label}
                    role="checkbox"
                    styles={styles}
                    onPress={() => toggleReminder(option.id)}
                  />
                ))}
              </View>
              <FieldLabel styles={styles} label="Snooze presets" optional />
              <View style={styles.chipRow}>
                {snoozeOptions.map((minutes) => (
                  <ChoiceChip
                    key={minutes}
                    accessibilityLabel={`Toggle ${minutes} minute snooze`}
                    active={snoozePresets.includes(minutes)}
                    label={`${minutes} min`}
                    role="checkbox"
                    styles={styles}
                    onPress={() => toggleSnooze(minutes)}
                  />
                ))}
              </View>
            </Section>

            <Section
              styles={styles}
              eyebrow="STEPS"
              title="Break it down, if that helps."
            >
              <View style={styles.subtaskAddRow}>
                <TextInput
                  accessibilityLabel="New subtask"
                  placeholder="Add a small step..."
                  placeholderTextColor={theme.textMuted}
                  returnKeyType="done"
                  style={styles.input}
                  value={subtaskDraft}
                  onChangeText={setSubtaskDraft}
                  onSubmitEditing={addSubtask}
                />
                <Pressable
                  accessibilityRole="button"
                  style={styles.secondaryButton}
                  onPress={addSubtask}
                >
                  <Text style={styles.secondaryButtonText}>Add step</Text>
                </Pressable>
              </View>
              {subtasks.length > 0 ? (
                <View style={styles.subtaskList}>
                  {subtasks.map((subtask, index) => (
                    <View key={subtask.id} style={styles.subtaskPanel}>
                      <View style={styles.subtaskRow}>
                        <View style={styles.subtaskNumber}>
                          <Text style={styles.subtaskNumberText}>
                            {index + 1}
                          </Text>
                        </View>
                        <Text style={styles.subtaskTitle}>{subtask.title}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove subtask ${subtask.title}`}
                          onPress={() =>
                            setSubtasks((current) =>
                              current.filter(
                                (item) => item.id !== subtask.id,
                              ),
                            )
                          }
                        >
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      </View>
                      {subtaskRemindersEnabled ? (
                        <>
                          <Text style={styles.subtaskReminderLabel}>
                            REMIND FOR THIS STEP
                          </Text>
                          <View style={styles.chipRow}>
                            {reminderOptions.map((option) => (
                              <ChoiceChip
                                key={option.id}
                                accessibilityLabel={`Set ${option.label} reminder for ${subtask.title}`}
                                active={(subtask.reminders ?? []).some(
                                  (reminder) =>
                                    reminder.stage === option.stage &&
                                    reminder.offsetMinutes === option.offset,
                                )}
                                label={option.label}
                                role="checkbox"
                                styles={styles}
                                onPress={() =>
                                  toggleSubtaskReminder(
                                    subtask.id,
                                    option.id,
                                  )
                                }
                              />
                            ))}
                          </View>
                        </>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
              <ToggleRow
                active={subtaskRemindersEnabled}
                label="Configure reminders for individual steps"
                styles={styles}
                onPress={toggleSubtaskReminderConfiguration}
              />
              {subtaskRemindersEnabled ? (
                <Text style={styles.sectionHint}>
                  Each selected timing uses the task due date and time as its
                  anchor.
                </Text>
              ) : null}
            </Section>
          </KeyboardAwareScrollView>
          <View style={styles.stickyFooter}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View
              style={[
                styles.footer,
                compact ? styles.footerCompact : undefined,
              ]}
            >
              {task ? (
                <Pressable
                  accessibilityRole="button"
                  style={[
                    styles.deleteButton,
                    confirmDelete ? styles.deleteButtonConfirm : undefined,
                  ]}
                  onPress={() => {
                    if (confirmDelete) {
                      onDelete(task);
                    } else {
                      setConfirmDelete(true);
                    }
                  }}
                >
                  <Text style={styles.deleteButtonText}>
                    {confirmDelete ? "Confirm delete" : "Delete task"}
                  </Text>
                </Pressable>
              ) : (
                <View />
              )}
              <View style={styles.footerActions}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.cancelButton}
                  onPress={onClose}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.saveButton}
                  onPress={submit}
                >
                  <Text style={styles.saveButtonText}>
                    {task ? "Save changes" : "Create task"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Section({
  children,
  eyebrow,
  styles,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function FieldLabel({
  label,
  optional = false,
  styles,
}: {
  label: string;
  optional?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {optional ? <Text style={styles.optionalLabel}>Optional</Text> : null}
    </View>
  );
}

function ChoiceChip({
  accessibilityLabel,
  active,
  label,
  role = "radio",
  styles,
  onPress,
}: {
  accessibilityLabel?: string;
  active: boolean;
  label: string;
  role?: "checkbox" | "radio";
  styles: ReturnType<typeof createStyles>;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={role}
      accessibilityState={{ checked: active }}
      aria-checked={active}
      style={[styles.chip, active ? styles.chipActive : undefined]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : undefined]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToggleRow({
  active,
  label,
  styles,
  onPress,
}: {
  active: boolean;
  label: string;
  styles: ReturnType<typeof createStyles>;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      aria-checked={active}
      style={styles.toggleRow}
      onPress={onPress}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggle, active ? styles.toggleActive : undefined]}>
        <View
          style={[
            styles.toggleThumb,
            active ? styles.toggleThumbActive : undefined,
          ]}
        />
      </View>
    </Pressable>
  );
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function remindersFromSelection(selected: string[]): Reminder[] {
  return reminderOptions
    .filter((option) => selected.includes(option.id))
    .map((option) => ({
      enabled: true,
      id: `${option.stage}-${option.offset}`,
      offsetMinutes: option.offset,
      stage: option.stage,
    }));
}

function isValidTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function frequencyUnit(
  frequency: TaskRecurrence["frequency"],
  interval: number,
) {
  const singular =
    frequency === "daily" ? "day" : frequency === "weekly" ? "week" : "month";
  return interval === 1 ? singular : `${singular}s`;
}

function weekdayForLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date().getDay() : date.getDay();
}

function createStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    overlay: {
      alignItems: "center",
      backgroundColor: "rgba(10, 14, 11, 0.72)",
      flex: 1,
      justifyContent: "center",
      padding: 18,
    },
    overlayCompact: {
      padding: 0,
    },
    modal: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 24,
      borderWidth: 1,
      maxHeight: "94%",
      maxWidth: 900,
      overflow: "hidden",
      width: "100%",
    },
    modalCompact: {
      borderRadius: 0,
      borderWidth: 0,
      height: "100%",
      maxHeight: "100%",
    },
    header: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 16,
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingVertical: 18,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.5,
      marginBottom: 4,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 22,
      letterSpacing: -0.7,
    },
    closeButton: {
      borderColor: theme.border,
      borderRadius: 11,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    closeButtonText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    form: {
      gap: 14,
      padding: 18,
    },
    formScroll: {
      flexShrink: 1,
    },
    section: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      padding: 18,
    },
    sectionEyebrow: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 1.4,
      marginBottom: 3,
    },
    sectionTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 16,
    },
    sectionHint: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      lineHeight: 14,
    },
    capabilityNotice: {
      backgroundColor: theme.shouldSoft,
      borderRadius: 12,
      gap: 3,
      padding: 11,
    },
    capabilityLabel: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    capabilityText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 8,
      lineHeight: 12,
    },
    sectionBody: {
      gap: 10,
      marginTop: 15,
    },
    fieldLabelRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 3,
    },
    fieldLabel: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
    },
    optionalLabel: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 8,
    },
    input: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
      minHeight: 44,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    smallInput: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
      minWidth: 72,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    detailsInput: {
      minHeight: 82,
    },
    kindGrid: {
      flexDirection: "row",
      gap: 9,
    },
    kindGridCompact: {
      flexDirection: "column",
    },
    kindCard: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 13,
      borderWidth: 1,
      flex: 1,
      padding: 13,
    },
    kindCardActive: {
      backgroundColor: theme.shouldSoft,
      borderColor: theme.should,
    },
    kindLabel: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    kindHint: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 8,
      lineHeight: 13,
      marginTop: 3,
    },
    infoNote: {
      backgroundColor: theme.niceSoft,
      borderRadius: 11,
      padding: 11,
    },
    infoNoteText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 8,
      lineHeight: 13,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },
    chip: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    chipActive: {
      backgroundColor: theme.shouldSoft,
      borderColor: theme.should,
    },
    chipText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
    },
    chipTextActive: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
    },
    fieldGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    fieldGridCompact: {
      flexDirection: "column",
      gap: 16,
    },
    fieldCell: {
      flexBasis: "47%",
      flexGrow: 1,
      gap: 8,
      minWidth: 0,
    },
    fieldCellCompact: {
      flexBasis: "auto",
      flexGrow: 0,
      width: "100%",
    },
    toggleRow: {
      alignItems: "center",
      backgroundColor: theme.background,
      borderRadius: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 12,
    },
    toggleLabel: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
    },
    toggle: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 12,
      height: 22,
      padding: 3,
      width: 38,
    },
    toggleActive: {
      backgroundColor: theme.should,
    },
    toggleThumb: {
      backgroundColor: theme.surface,
      borderRadius: 8,
      height: 16,
      width: 16,
    },
    toggleThumbActive: {
      alignSelf: "flex-end",
    },
    subtaskAddRow: {
      alignItems: "stretch",
      flexDirection: "row",
      gap: 8,
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    secondaryButtonText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    subtaskList: {
      gap: 6,
    },
    subtaskPanel: {
      backgroundColor: theme.background,
      borderRadius: 11,
      gap: 8,
      padding: 10,
    },
    subtaskRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
    },
    subtaskNumber: {
      alignItems: "center",
      backgroundColor: theme.surfaceMuted,
      borderRadius: 8,
      height: 23,
      justifyContent: "center",
      width: 23,
    },
    subtaskNumberText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    subtaskTitle: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
    },
    subtaskReminderLabel: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 7,
      letterSpacing: 1,
      marginLeft: 32,
    },
    removeText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 8,
    },
    errorText: {
      color: theme.must,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
      paddingHorizontal: 4,
    },
    stickyFooter: {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
      borderTopWidth: 1,
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    footer: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
    },
    footerCompact: {
      alignItems: "stretch",
      flexDirection: "column-reverse",
      gap: 12,
    },
    footerActions: {
      flexDirection: "row",
      gap: 8,
    },
    cancelButton: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 17,
    },
    cancelButtonText: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
    },
    saveButton: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 12,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 19,
    },
    saveButtonText: {
      color: theme.background,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
    },
    deleteButton: {
      borderColor: theme.must,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    deleteButtonConfirm: {
      backgroundColor: theme.mustSoft,
    },
    deleteButtonText: {
      color: theme.must,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
  });
}
