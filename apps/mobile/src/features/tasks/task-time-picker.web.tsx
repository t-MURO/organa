import { useAppTheme } from "../../components/app-shell";
import type { TaskTimePickerProps } from "./task-time-picker.types";

export function TimePickerField({
  accessibilityLabel,
  value,
  onChange,
}: TaskTimePickerProps) {
  const theme = useAppTheme();

  return (
    <div style={{ display: "flex", gap: 8, minHeight: 44 }}>
      <input
        aria-label={accessibilityLabel}
        type="time"
        value={value}
        style={{
          background: theme.background,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          color: theme.text,
          colorScheme: theme.background === "#171a17" ? "dark" : "light",
          flex: 1,
          fontFamily: "Manrope_600SemiBold",
          fontSize: 14,
          minWidth: 0,
          padding: "10px 13px",
        }}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {value ? (
        <button
          aria-label={`Clear ${accessibilityLabel.toLowerCase()}`}
          type="button"
          style={{
            background: "transparent",
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            color: theme.textMuted,
            cursor: "pointer",
            fontFamily: "Manrope_700Bold",
            fontSize: 11,
            padding: "0 12px",
          }}
          onClick={() => onChange("")}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
