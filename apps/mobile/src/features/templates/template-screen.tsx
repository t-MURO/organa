import {
  canTaskKindRepeat,
  formatLocalDate,
  instantiateTaskTemplate,
  searchTaskTemplates,
  type TaskKind,
  type TaskPriority,
  type TaskRecurrence,
  type TaskTemplate,
  type TaskTemplateInput,
} from "@organa/domain";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useReducedMotion } from "../../accessibility/use-reduced-motion";
import { useAppTheme } from "../../components/app-shell";
import {
  KeyboardAvoidingView,
  keyboardAwareScrollProps,
} from "../../components/keyboard";
import { TextInput } from "../../components/themed-text-input";
import type { OrganaTheme } from "../../theme";
import { StyleSheet } from "../../typography";
import { useTasks } from "../tasks/task-context";
import { useTemplates } from "./template-context";

type Filter = "all" | "official" | "user";

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "official", label: "Official" },
  { value: "user", label: "Mine" },
];

const kinds: Array<{ value: TaskKind; label: string }> = [
  { value: "one_off", label: "One-off" },
  { value: "habit", label: "Routine" },
  { value: "medication", label: "Medication" },
];

const priorities: Array<{ value: TaskPriority; label: string }> = [
  { value: "must", label: "Must do" },
  { value: "should", label: "Should do" },
  { value: "nice", label: "Nice to do" },
];

export function TemplateScreen() {
  const theme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const { addTask } = useTasks();
  const {
    loading,
    officialTemplates,
    userTemplates,
    copyTemplate,
    createTemplate,
    editTemplate,
    removeTemplate,
  } = useTemplates();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate>();
  const [editorVisible, setEditorVisible] = useState(false);
  const [notice, setNotice] = useState("");

  const templates = searchTaskTemplates(
    [...officialTemplates, ...userTemplates].filter(
      (template) => filter === "all" || template.source === filter,
    ),
    query,
  );

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 3000);
  }

  function useTemplate(template: TaskTemplate) {
    addTask(instantiateTaskTemplate(template, formatLocalDate(new Date())));
    showNotice(`Added "${template.task.title}" to today.`);
  }

  function createNew() {
    setEditingTemplate(undefined);
    setEditorVisible(true);
  }

  function edit(template: TaskTemplate) {
    setEditingTemplate(template);
    setEditorVisible(true);
  }

  function customize(template: TaskTemplate) {
    const copy = copyTemplate(template);
    setEditingTemplate(copy);
    setEditorVisible(true);
  }

  function save(input: TaskTemplateInput) {
    if (editingTemplate) {
      editTemplate(editingTemplate, input);
      showNotice("Private template updated.");
    } else {
      createTemplate(input);
      showNotice("Private template created.");
    }
    setEditorVisible(false);
    setEditingTemplate(undefined);
  }

  function remove(template: TaskTemplate) {
    removeTemplate(template.id);
    setEditorVisible(false);
    setEditingTemplate(undefined);
    showNotice("Private template deleted.");
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accentStrong} />
        <Text role="status" style={styles.loadingText}>
          Opening your library...
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        {...keyboardAwareScrollProps}
        contentContainerStyle={[
          styles.page,
          compact ? styles.pageCompact : undefined,
        ]}
      >
        <View
          style={[styles.hero, compact ? styles.heroCompact : undefined]}
        >
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>TASK LIBRARY</Text>
            <Text role="heading" style={styles.title}>
              Start from something steady.
            </Text>
            <Text style={styles.subtitle}>
              Use an official preset as-is, or shape a private template around
              the way your day actually works.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={createNew}
          >
            <Text style={styles.primaryButtonText}>New template</Text>
          </Pressable>
        </View>

        <View style={styles.tools}>
          <TextInput
            accessibilityLabel="Search templates"
            placeholder="Search the library..."
            placeholderTextColor={theme.textMuted}
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />
          <View style={styles.filters}>
            {filters.map((item) => (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: filter === item.value }}
                aria-checked={filter === item.value}
                style={[
                  styles.filterChip,
                  filter === item.value ? styles.filterChipActive : undefined,
                ]}
                onPress={() => setFilter(item.value)}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === item.value
                      ? styles.filterTextActive
                      : undefined,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {notice ? (
          <View accessibilityRole="alert" style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <View style={[styles.grid, compact ? styles.gridCompact : undefined]}>
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              styles={styles}
              template={template}
              onCustomize={customize}
              onEdit={edit}
              onUse={useTemplate}
            />
          ))}
        </View>

        {templates.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing matched that search.</Text>
            <Text style={styles.emptyText}>
              Try a broader word, or make a private template of your own.
            </Text>
          </View>
        ) : null}
      </ScrollView>
        <TemplateEditor
          reducedMotion={reducedMotion}
        template={editingTemplate}
        visible={editorVisible}
        onClose={() => {
          setEditorVisible(false);
          setEditingTemplate(undefined);
        }}
        onDelete={remove}
        onSave={save}
      />
    </>
  );
}

function TemplateCard({
  styles,
  template,
  onCustomize,
  onEdit,
  onUse,
}: {
  styles: ReturnType<typeof createStyles>;
  template: TaskTemplate;
  onCustomize(template: TaskTemplate): void;
  onEdit(template: TaskTemplate): void;
  onUse(template: TaskTemplate): void;
}) {
  const isOfficial = template.source === "official";
  const meta = [
    formatKind(template.task.kind),
    formatPriority(template.task.priority),
    template.task.recurrence
      ? capitalize(template.task.recurrence.frequency)
      : "One time",
    template.task.estimatedMinutes
      ? `${template.task.estimatedMinutes} min`
      : undefined,
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View
          style={[
            styles.sourcePill,
            isOfficial ? styles.officialPill : styles.privatePill,
          ]}
        >
          <Text style={styles.sourceText}>
            {isOfficial ? "ORGANA PRESET" : "PRIVATE"}
          </Text>
        </View>
        <Text style={styles.cardMeta}>{meta.join(" / ")}</Text>
      </View>
      <Text style={styles.cardTitle}>{template.name}</Text>
      <Text style={styles.taskTitle}>{template.task.title}</Text>
      <Text style={styles.cardDescription}>
        {template.description ?? "Ready when this task comes around again."}
      </Text>
      <View style={styles.cardActions}>
        <Pressable
          accessibilityLabel={`Use ${template.name}`}
          accessibilityRole="button"
          style={styles.useButton}
          onPress={() => onUse(template)}
        >
          <Text style={styles.useButtonText}>Add to today</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`${isOfficial ? "Customize" : "Edit"} ${template.name}`}
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() =>
            isOfficial ? onCustomize(template) : onEdit(template)
          }
        >
          <Text style={styles.secondaryButtonText}>
            {isOfficial ? "Customize" : "Edit"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function TemplateEditor({
  reducedMotion,
  template,
  visible,
  onClose,
  onDelete,
  onSave,
}: {
  reducedMotion: boolean;
  template?: TaskTemplate;
  visible: boolean;
  onClose(): void;
  onDelete(template: TaskTemplate): void;
  onSave(input: TaskTemplateInput): void;
}) {
  const theme = useAppTheme();
  const styles = createEditorStyles(theme);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [kind, setKind] = useState<TaskKind>("one_off");
  const [priority, setPriority] = useState<TaskPriority>("should");
  const [duration, setDuration] = useState("");
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [frequency, setFrequency] =
    useState<TaskRecurrence["frequency"]>("daily");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setTitle(template?.task.title ?? "");
    setDetails(template?.task.details ?? "");
    setKind(template?.task.kind ?? "one_off");
    setPriority(template?.task.priority ?? "should");
    setDuration(template?.task.estimatedMinutes?.toString() ?? "");
    setRecurrenceEnabled(
      Boolean(template?.task.recurrence) &&
        canTaskKindRepeat(template?.task.kind),
    );
    setFrequency(template?.task.recurrence?.frequency ?? "daily");
    setError("");
    setConfirmDelete(false);
  }, [template, visible]);

  function selectKind(nextKind: TaskKind) {
    setKind(nextKind);
    if (!canTaskKindRepeat(nextKind)) {
      setRecurrenceEnabled(false);
    } else if (!recurrenceEnabled) {
      setRecurrenceEnabled(true);
    }
  }

  function submit() {
    if (!name.trim() || !title.trim()) {
      setError("Add both a template name and a task title.");
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
    onSave({
      name,
      description,
      task: {
        title,
        details,
        kind,
        priority,
        estimatedMinutes,
        recurrence: canTaskKindRepeat(kind) && recurrenceEnabled
          ? { frequency, interval: 1 }
          : undefined,
        reminders: template?.task.reminders,
        subtasks: template?.task.subtasks,
        snoozePresets: template?.task.snoozePresets,
        graceDays:
          canTaskKindRepeat(kind) && recurrenceEnabled
            ? template?.task.graceDays
            : undefined,
        requireDoseConfirmation:
          kind === "medication"
            ? template?.task.requireDoseConfirmation
            : undefined,
        subtaskRemindersEnabled: template?.task.subtaskRemindersEnabled,
        scheduledTime: template?.task.scheduledTime,
      },
    });
  }

  return (
    <Modal
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>
                {template ? "PRIVATE TEMPLATE" : "NEW TEMPLATE"}
              </Text>
              <Text style={styles.heading}>
                {template ? "Adjust your starting point." : "Save a shortcut."}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close template editor"
              accessibilityRole="button"
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView
            {...keyboardAwareScrollProps}
            contentContainerStyle={styles.form}
          >
            <Field
              label="Template name"
              placeholder="Morning reset"
              styles={styles}
              theme={theme}
              value={name}
              onChange={setName}
            />
            <Field
              label="Short description"
              placeholder="Why this helps..."
              styles={styles}
              theme={theme}
              value={description}
              onChange={setDescription}
            />
            <View style={styles.divider} />
            <Field
              label="Task title"
              placeholder="The next clear action"
              styles={styles}
              theme={theme}
              value={title}
              onChange={setTitle}
            />
            <Field
              label="Task details"
              placeholder="Optional context"
              styles={styles}
              theme={theme}
              value={details}
              onChange={setDetails}
            />
            <Text style={styles.label}>Type</Text>
            <ChipRow
              items={kinds}
              selected={kind}
              styles={styles}
              onSelect={(value) => selectKind(value as TaskKind)}
            />
            <Text style={styles.label}>Priority</Text>
            <ChipRow
              items={priorities}
              selected={priority}
              styles={styles}
              onSelect={(value) => setPriority(value as TaskPriority)}
            />
            <Field
              keyboardType="number-pad"
              label="Estimated minutes"
              placeholder="10"
              styles={styles}
              theme={theme}
              value={duration}
              onChange={setDuration}
            />
            {canTaskKindRepeat(kind) ? (
              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.label}>Repeating task</Text>
                  <Text style={styles.hint}>Create the next occurrence.</Text>
                </View>
                <Pressable
                  accessibilityLabel="Repeat this template task"
                  accessibilityRole="switch"
                  accessibilityState={{ checked: recurrenceEnabled }}
                  aria-checked={recurrenceEnabled}
                  style={[
                    styles.toggle,
                    recurrenceEnabled ? styles.toggleActive : undefined,
                  ]}
                  onPress={() => setRecurrenceEnabled((current) => !current)}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      recurrenceEnabled
                        ? styles.toggleThumbActive
                        : undefined,
                    ]}
                  />
                </Pressable>
              </View>
            ) : (
              <Text style={styles.hint}>
                Choose Routine or Medication for a repeating template.
              </Text>
            )}
            {canTaskKindRepeat(kind) && recurrenceEnabled ? (
              <ChipRow
                items={[
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                ]}
                selected={frequency}
                styles={styles}
                onSelect={(value) =>
                  setFrequency(value as TaskRecurrence["frequency"])
                }
              />
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.footer}>
              {template ? (
                confirmDelete ? (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.deleteConfirm}
                    onPress={() => onDelete(template)}
                  >
                    <Text style={styles.deleteConfirmText}>Delete template</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setConfirmDelete(true)}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                )
              ) : (
                <View />
              )}
              <Pressable
                accessibilityRole="button"
                style={styles.saveButton}
                onPress={submit}
              >
                <Text style={styles.saveText}>Save template</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  keyboardType,
  label,
  placeholder,
  styles,
  theme,
  value,
  onChange,
}: {
  keyboardType?: "default" | "number-pad";
  label: string;
  placeholder: string;
  styles: ReturnType<typeof createEditorStyles>;
  theme: OrganaTheme;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        style={styles.input}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}

function ChipRow({
  items,
  selected,
  styles,
  onSelect,
}: {
  items: Array<{ value: string; label: string }>;
  selected: string;
  styles: ReturnType<typeof createEditorStyles>;
  onSelect(value: string): void;
}) {
  return (
    <View style={styles.chips}>
      {items.map((item) => (
        <Pressable
          key={item.value}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === item.value }}
          aria-checked={selected === item.value}
          style={[
            styles.chip,
            selected === item.value ? styles.chipActive : undefined,
          ]}
          onPress={() => onSelect(item.value)}
        >
          <Text
            style={[
              styles.chipText,
              selected === item.value ? styles.chipTextActive : undefined,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function formatKind(kind: TaskKind | undefined) {
  if (kind === "medication") return "Medication";
  if (kind === "habit") return "Routine";
  return "Task";
}

function formatPriority(priority: TaskPriority | undefined) {
  if (priority === "must") return "Must do";
  if (priority === "nice") return "Nice to do";
  return "Should do";
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function createStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    loading: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center" },
    loadingText: { color: theme.textMuted, fontFamily: "Manrope_600SemiBold" },
    page: {
      alignSelf: "center",
      maxWidth: 1480,
      paddingBottom: 60,
      paddingHorizontal: 28,
      paddingTop: 34,
      width: "100%",
    },
    pageCompact: { paddingHorizontal: 16, paddingTop: 20 },
    hero: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 28,
    },
    heroCompact: { alignItems: "stretch", flexDirection: "column", gap: 20 },
    heroCopy: { flex: 1 },
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
      letterSpacing: -1.4,
      lineHeight: 40,
    },
    subtitle: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
      maxWidth: 610,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 46,
      paddingHorizontal: 20,
    },
    primaryButtonText: {
      color: theme.background,
      fontFamily: "Manrope_700Bold",
      fontSize: 13,
    },
    tools: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 22,
    },
    search: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      color: theme.text,
      flexGrow: 1,
      fontFamily: "Manrope_400Regular",
      minWidth: 220,
      paddingHorizontal: 15,
      paddingVertical: 12,
    },
    filters: { flexDirection: "row", gap: 7 },
    filterChip: {
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    filterChipActive: { backgroundColor: theme.shouldSoft },
    filterText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
    },
    filterTextActive: { color: theme.accentStrong },
    notice: {
      backgroundColor: theme.shouldSoft,
      borderRadius: 12,
      marginBottom: 16,
      padding: 12,
    },
    noticeText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
    gridCompact: { flexDirection: "column" },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      flexBasis: 320,
      flexGrow: 1,
      maxWidth: 580,
      minWidth: 290,
      padding: 20,
    },
    cardTop: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
      justifyContent: "space-between",
    },
    sourcePill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
    officialPill: { backgroundColor: theme.shouldSoft },
    privatePill: { backgroundColor: theme.niceSoft },
    sourceText: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 1,
    },
    cardMeta: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
    },
    cardTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 20,
      letterSpacing: -0.5,
      marginTop: 20,
    },
    taskTitle: {
      color: theme.accentStrong,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
      marginTop: 4,
    },
    cardDescription: {
      color: theme.textMuted,
      flex: 1,
      fontFamily: "Manrope_400Regular",
      fontSize: 13,
      lineHeight: 20,
      marginTop: 12,
      minHeight: 40,
    },
    cardActions: { flexDirection: "row", gap: 9, marginTop: 20 },
    useButton: {
      backgroundColor: theme.accentStrong,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    useButtonText: {
      color: theme.background,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    secondaryButton: {
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    secondaryButtonText: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
    },
    empty: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 18,
      borderStyle: "dashed",
      borderWidth: 1,
      marginTop: 8,
      padding: 38,
    },
    emptyTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 15,
    },
    emptyText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 12,
      marginTop: 5,
      textAlign: "center",
    },
  });
}

function createEditorStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    overlay: {
      alignItems: "center",
      backgroundColor: "rgba(12, 16, 13, 0.64)",
      flex: 1,
      justifyContent: "center",
      padding: 16,
    },
    modal: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 24,
      borderWidth: 1,
      maxHeight: "92%",
      maxWidth: 680,
      overflow: "hidden",
      width: "100%",
    },
    header: {
      alignItems: "flex-start",
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 22,
    },
    headerCopy: { flex: 1 },
    eyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.6,
    },
    heading: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 23,
      letterSpacing: -0.8,
      marginTop: 5,
    },
    closeButton: {
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    closeText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
    },
    form: { gap: 15, padding: 22 },
    field: { gap: 7 },
    label: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    input: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      color: theme.text,
      fontFamily: "Manrope_400Regular",
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    divider: { backgroundColor: theme.border, height: 1, marginVertical: 3 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    chip: {
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    chipActive: { backgroundColor: theme.shouldSoft },
    chipText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
    },
    chipTextActive: { color: theme.accentStrong },
    toggleRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    toggleCopy: { gap: 3 },
    hint: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 10,
    },
    toggle: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 14,
      height: 28,
      padding: 3,
      width: 48,
    },
    toggleActive: { backgroundColor: theme.accent },
    toggleThumb: {
      backgroundColor: theme.surface,
      borderRadius: 11,
      height: 22,
      width: 22,
    },
    toggleThumbActive: { alignSelf: "flex-end" },
    error: {
      color: theme.must,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
    },
    footer: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 6,
    },
    saveButton: {
      backgroundColor: theme.accentStrong,
      borderRadius: 13,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    saveText: {
      color: theme.background,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    deleteText: {
      color: theme.must,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
    },
    deleteConfirm: {
      backgroundColor: theme.mustSoft,
      borderRadius: 12,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    deleteConfirmText: {
      color: theme.must,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
  });
}
