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
import { createWidget } from "expo-widgets";

export interface NextReminderWidgetProps {
  deepLink: string;
  time: string;
  title: string;
}

function NextReminderWidget(props: NextReminderWidgetProps) {
  "widget";
  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[
        containerBackground("#285c50", "widget"),
        frame({ maxHeight: Infinity, maxWidth: Infinity }),
        padding({ all: 16 }),
        widgetURL(props.deepLink),
      ]}
    >
      <Text
        modifiers={[
          font({ design: "rounded", size: 11, weight: "bold" }),
          foregroundStyle("#dcebe4"),
        ]}
      >
        NEXT REMINDER
      </Text>
      <Spacer />
      <Text
        modifiers={[
          font({ design: "rounded", size: 27, weight: "bold" }),
          foregroundStyle("#fffdf8"),
        ]}
      >
        {props.time}
      </Text>
      <Text
        modifiers={[
          font({ size: 13, weight: "medium" }),
          foregroundStyle("#fffdf8"),
          lineLimit(2),
        ]}
      >
        {props.title}
      </Text>
    </VStack>
  );
}

export default createWidget("NextReminderWidget", NextReminderWidget);
