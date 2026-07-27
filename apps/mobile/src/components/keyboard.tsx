import { useEffect, useRef, type PropsWithChildren } from "react";
import {
  type FocusEvent,
  Keyboard,
  KeyboardAvoidingView as NativeKeyboardAvoidingView,
  Platform,
  ScrollView,
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

const keyboardAwareScrollProps = {
  automaticallyAdjustKeyboardInsets: true,
  keyboardDismissMode: Platform.OS === "ios" ? "interactive" : "on-drag",
  keyboardShouldPersistTaps: "handled",
} satisfies Pick<
  ScrollViewProps,
  | "automaticallyAdjustKeyboardInsets"
  | "keyboardDismissMode"
  | "keyboardShouldPersistTaps"
>;

export function KeyboardAwareScrollView({
  onFocus,
  ...props
}: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const focusedTarget = useRef<FocusEvent["target"] | undefined>(undefined);

  function keepInputVisible(target = focusedTarget.current) {
    if (Platform.OS === "web" || target === undefined) return;
    scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
      target,
      28,
      true,
    );
  }

  useEffect(() => {
    if (Platform.OS === "web") return;
    const eventName =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscription = Keyboard.addListener(eventName, () => {
      keepInputVisible();
    });
    return () => subscription.remove();
  }, []);

  return (
    <ScrollView
      {...keyboardAwareScrollProps}
      {...props}
      ref={scrollRef}
      onFocus={(event) => {
        focusedTarget.current = event.target;
        onFocus?.(event);
        setTimeout(() => keepInputVisible(event.target), 80);
      }}
    />
  );
}
