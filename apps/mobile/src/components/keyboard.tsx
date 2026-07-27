import { type PropsWithChildren, useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView as NativeKeyboardAvoidingView,
  Platform,
  ScrollView,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
  useWindowDimensions,
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

export function KeyboardAwareScrollView(props: ScrollViewProps) {
  return <ScrollView {...keyboardAwareScrollProps} {...props} />;
}

export function useKeyboardInset() {
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardTop, setKeyboardTop] = useState<number>();

  useEffect(() => {
    if (Platform.OS === "web") return;

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardTop(event.endCoordinates.screenY);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardTop(undefined);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (keyboardTop === undefined) return 0;

  // Android resize mode may already shorten the window. Only add the portion
  // of the keyboard that still overlaps the visible app area.
  return Math.max(0, windowHeight - keyboardTop);
}
