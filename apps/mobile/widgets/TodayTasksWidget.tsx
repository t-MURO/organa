import { Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

export interface TodayTasksWidgetProps {
  remaining: number;
  tasks: string[];
}

function TodayTasksWidget(
  props: TodayTasksWidgetProps,
  environment: WidgetEnvironment,
) {
  "widget";
  const visible = props.tasks.slice(
    0,
    environment.widgetFamily === "systemSmall" ? 3 : 5,
  );
  return (
    <VStack
      alignment="leading"
      spacing={5}
      modifiers={[
        containerBackground("#f4f0e7", "widget"),
        frame({ maxHeight: Infinity, maxWidth: Infinity }),
        padding({ all: 15 }),
        widgetURL("organa:///"),
      ]}
    >
      <Text
        modifiers={[
          font({ design: "rounded", size: 11, weight: "bold" }),
          foregroundStyle("#327061"),
        ]}
      >
        ORGANA / TODAY
      </Text>
      <Text
        modifiers={[
          font({ design: "rounded", size: 19, weight: "bold" }),
          foregroundStyle("#20251f"),
        ]}
      >
        {props.remaining === 0
          ? "A clear space"
          : `${props.remaining} left for today`}
      </Text>
      <Spacer />
      {visible.length === 0 ? (
        <Text modifiers={[foregroundStyle("#70766d")]}>
          Nothing needs your attention.
        </Text>
      ) : (
        visible.map((task) => (
          <Text
            key={task}
            modifiers={[
              font({ size: 12, weight: "medium" }),
              foregroundStyle("#20251f"),
              lineLimit(1),
            ]}
          >
            {`- ${task}`}
          </Text>
        ))
      )}
    </VStack>
  );
}

export default createWidget("TodayTasksWidget", TodayTasksWidget);
