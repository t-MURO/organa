import {
  Pressable as NativePressable,
  type PressableProps,
} from "react-native";

export const minimumNativeHitSlop = {
  bottom: 14,
  left: 14,
  right: 14,
  top: 14,
} as const;

export function AccessiblePressable({
  hitSlop = minimumNativeHitSlop,
  ...props
}: PressableProps) {
  return <NativePressable {...props} hitSlop={hitSlop} />;
}
