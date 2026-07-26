import type { PropsWithChildren } from "react";
import {
  KeyboardAvoidingView as NativeKeyboardAvoidingView,
  Platform,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
} from "react-native";

type Props = PropsWithChildren<Omit<KeyboardAvoidingViewProps, "behavior">>;

export function KeyboardAvoidingView({ children, ...props }: Props) {
  return (
    <NativeKeyboardAvoidingView
      {...props}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : Platform.OS === "android"
            ? "height"
            : undefined
      }
    >
      {children}
    </NativeKeyboardAvoidingView>
  );
}

export const keyboardAwareScrollProps = {
  automaticallyAdjustKeyboardInsets: true,
  keyboardDismissMode: Platform.OS === "ios" ? "interactive" : "on-drag",
  keyboardShouldPersistTaps: "handled",
} satisfies Pick<
  ScrollViewProps,
  | "automaticallyAdjustKeyboardInsets"
  | "keyboardDismissMode"
  | "keyboardShouldPersistTaps"
>;
