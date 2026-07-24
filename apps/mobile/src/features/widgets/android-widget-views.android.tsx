"use no memo";

import {
  FlexWidget,
  TextWidget,
  type ColorProp,
  type WidgetInfo,
  type WidgetRepresentation,
} from "react-native-android-widget";

import type { AndroidWidgetSnapshot } from "./android-widget-snapshot.android";

interface WidgetPalette {
  accent: ColorProp;
  background: ColorProp;
  muted: ColorProp;
  reminder: ColorProp;
  text: ColorProp;
}

const colors: Record<"dark" | "light", WidgetPalette> = {
  dark: {
    accent: "#8FC8B8",
    background: "#18211E",
    muted: "#AAB7B0",
    reminder: "#214C43",
    text: "#F7F4EC",
  },
  light: {
    accent: "#327061",
    background: "#F4F0E7",
    muted: "#70766D",
    reminder: "#285C50",
    text: "#20251F",
  },
};

export function renderTodayTasksAndroidWidget(
  snapshot: AndroidWidgetSnapshot,
  info: WidgetInfo,
): WidgetRepresentation {
  return {
    dark: todayWidget(snapshot, info, colors.dark),
    light: todayWidget(snapshot, info, colors.light),
  };
}

export function renderNextReminderAndroidWidget(
  snapshot: AndroidWidgetSnapshot,
): WidgetRepresentation {
  return {
    dark: nextReminderWidget(snapshot, colors.dark),
    light: nextReminderWidget(snapshot, colors.light),
  };
}

function todayWidget(
  snapshot: AndroidWidgetSnapshot,
  info: WidgetInfo,
  palette: WidgetPalette,
) {
  const visibleTasks = snapshot.today.tasks.slice(
    0,
    info.height >= 180 ? 5 : info.height >= 130 ? 3 : 2,
  );
  const title =
    snapshot.today.remaining === 0
      ? "A clear space"
      : `${snapshot.today.remaining} left for today`;
  const accessibilityLabel =
    snapshot.today.remaining === 0
      ? "Organa Today. Nothing needs your attention."
      : `Organa Today. ${title}. ${visibleTasks.join(". ")}`;

  return (
    <FlexWidget
      accessibilityLabel={accessibilityLabel}
      clickAction="OPEN_URI"
      clickActionData={{ uri: "organa:///" }}
      style={{
        backgroundColor: palette.background,
        borderRadius: 20,
        flexDirection: "column",
        height: "match_parent",
        padding: 16,
        width: "match_parent",
      }}
    >
      <TextWidget
        text="ORGANA / TODAY"
        style={{
          color: palette.accent,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.8,
        }}
      />
      <TextWidget
        maxLines={1}
        text={title}
        truncate="END"
        style={{
          color: palette.text,
          fontSize: 20,
          fontWeight: "800",
          marginTop: 6,
        }}
      />
      <FlexWidget style={{ flex: 1, flexDirection: "column", marginTop: 8 }}>
        {visibleTasks.length === 0 ? (
          <TextWidget
            maxLines={2}
            text="Nothing needs your attention."
            style={{ color: palette.muted, fontSize: 12 }}
          />
        ) : (
          visibleTasks.map((task, index) => (
            <TextWidget
              key={`${index}-${task}`}
              maxLines={1}
              text={`- ${task}`}
              truncate="END"
              style={{
                color: palette.text,
                fontSize: 12,
                lineSpacingExtra: 2,
              }}
            />
          ))
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

function nextReminderWidget(
  snapshot: AndroidWidgetSnapshot,
  palette: WidgetPalette,
) {
  const next = snapshot.nextReminder;
  const title = next?.title ?? "No upcoming reminder";
  const time = next?.time ?? "--:--";
  return (
    <FlexWidget
      accessibilityLabel={`Organa next reminder. ${time}. ${title}`}
      clickAction="OPEN_URI"
      clickActionData={{ uri: next?.deepLink ?? "organa:///" }}
      style={{
        backgroundColor: palette.reminder,
        borderRadius: 20,
        flexDirection: "column",
        height: "match_parent",
        padding: 16,
        width: "match_parent",
      }}
    >
      <TextWidget
        text="NEXT REMINDER"
        style={{
          color: palette.accent,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.8,
        }}
      />
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget
        maxLines={1}
        text={time}
        style={{
          color: palette.text,
          fontSize: 27,
          fontWeight: "800",
        }}
      />
      <TextWidget
        maxLines={2}
        text={title}
        truncate="END"
        style={{
          color: palette.text,
          fontSize: 13,
          fontWeight: "600",
          marginTop: 4,
        }}
      />
    </FlexWidget>
  );
}
