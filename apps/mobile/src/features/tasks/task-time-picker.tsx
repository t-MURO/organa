import { useAppTheme } from "../../components/app-shell";
import { TextInput } from "../../components/themed-text-input";
import type { TaskTimePickerProps } from "./task-time-picker.types";

export function TimePickerField({
  accessibilityLabel,
  value,
  onChange,
}: TaskTimePickerProps) {
  const theme = useAppTheme();

  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      keyboardType="numbers-and-punctuation"
      placeholder="HH:MM"
      placeholderTextColor={theme.textMuted}
      value={value}
      onChangeText={onChange}
    />
  );
}
