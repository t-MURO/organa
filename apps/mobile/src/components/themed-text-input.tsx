import { forwardRef, useState } from "react";
import {
  Platform,
  TextInput as NativeTextInput,
  type TextStyle,
  type TextInputProps,
  useColorScheme,
} from "react-native";

import { darkTheme, lightTheme } from "../theme";
import { useOptionalAppTheme } from "./app-shell";

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(
  function TextInput(
    {
      cursorColor,
      onBlur,
      onFocus,
      selectionColor,
      style,
      ...props
    },
    ref,
  ) {
    const colorScheme = useColorScheme();
    const [focused, setFocused] = useState(false);
    const appTheme = useOptionalAppTheme();
    const theme =
      appTheme ?? (colorScheme === "dark" ? darkTheme : lightTheme);
    const activeColor = selectionColor ?? theme.accentStrong;

    return (
      <NativeTextInput
        {...props}
        ref={ref}
        cursorColor={cursorColor ?? activeColor}
        selectionColor={activeColor}
        style={[
          style,
          Platform.OS === "web"
            ? ({ caretColor: activeColor } as TextStyle)
            : focused
              ? { borderColor: theme.accentStrong }
              : undefined,
        ]}
        underlineColorAndroid="transparent"
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
      />
    );
  },
);
