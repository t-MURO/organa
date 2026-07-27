import { useAppTheme } from "../../components/app-shell";
import { TextInput } from "../../components/themed-text-input";
import type { TaskDatePickerProps } from "./task-date-picker.types";

export function DatePickerField({
  accessibilityLabel,
  value,
  onChange,
}: TaskDatePickerProps) {
  const theme = useAppTheme();

  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      placeholder="YYYY-MM-DD"
      placeholderTextColor={theme.textMuted}
      value={value}
      onChangeText={onChange}
    />
  );
}
