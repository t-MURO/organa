import {
  Platform,
  StyleSheet as NativeStyleSheet,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type NamedStyle = ImageStyle | TextStyle | ViewStyle;
type TypographyAwareStyle = NamedStyle & {
  fontSize?: number;
  lineHeight?: number;
};

function readableFontSize(size: number) {
  if (Platform.OS === "web") {
    if (size <= 9) return size + 4;
    if (size <= 13) return size + 3;
    if (size <= 20) return size + 2;
    return Math.round(size * 1.06);
  }

  if (size <= 9) return size + 3;
  if (size <= 13) return size + 2;
  if (size <= 20) return size + 1;
  return Math.round(size * 1.03);
}

function applyReadableType(style: TypographyAwareStyle): NamedStyle {
  if (typeof style.fontSize !== "number") return style;

  const fontSize = readableFontSize(style.fontSize);
  if (fontSize === style.fontSize) return style;

  return {
    ...style,
    fontSize,
    lineHeight:
      typeof style.lineHeight === "number"
        ? style.lineHeight + fontSize - style.fontSize
        : style.lineHeight,
  };
}

function create<
  T extends
    | NativeStyleSheet.NamedStyles<T>
    | NativeStyleSheet.NamedStyles<any>,
>(styles: T & NativeStyleSheet.NamedStyles<any>): T {
  const readableStyles = Object.fromEntries(
    Object.entries(styles).map(([name, style]) => [
      name,
      applyReadableType(style as TypographyAwareStyle),
    ]),
  ) as T & NativeStyleSheet.NamedStyles<any>;

  return NativeStyleSheet.create(readableStyles);
}

export const StyleSheet = {
  ...NativeStyleSheet,
  create,
} as typeof NativeStyleSheet;
