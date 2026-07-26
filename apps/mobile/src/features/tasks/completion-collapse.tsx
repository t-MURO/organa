import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

import { useReducedMotion } from "../../accessibility/use-reduced-motion";

export const COMPLETION_TRANSITION_MS = 5_000;
const COMPLETION_COLLAPSE_DELAY_MS = 4_000;
const COMPLETION_COLLAPSE_MS = 900;

export function CompletionCollapse({
  children,
  completed,
}: {
  children: ReactNode;
  completed: boolean;
}) {
  const height = useRef(new Animated.Value(0)).current;
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    height.stopAnimation();

    if (!completed || reducedMotion || measuredHeight <= 0) {
      return;
    }

    height.setValue(measuredHeight);
    Animated.sequence([
      Animated.delay(COMPLETION_COLLAPSE_DELAY_MS),
      Animated.timing(height, {
        duration: COMPLETION_COLLAPSE_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: false,
      }),
    ]).start();

    return () => height.stopAnimation();
  }, [completed, height, measuredHeight, reducedMotion]);

  return (
    <Animated.View
      style={
        completed && !reducedMotion && measuredHeight > 0
          ? { height, overflow: "hidden" }
          : undefined
      }
      onLayout={(event) => {
        const nextHeight = event.nativeEvent.layout.height;
        if (completed && measuredHeight > 0) return;
        if (Math.abs(nextHeight - measuredHeight) < 0.5) return;
        setMeasuredHeight(nextHeight);
        height.setValue(nextHeight);
      }}
    >
      {children}
    </Animated.View>
  );
}
