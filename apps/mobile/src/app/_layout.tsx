import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppShell } from "../components/app-shell";
import { BrainDumpProvider } from "../features/brain-dump/brain-dump-context";
import { CheckInProvider } from "../features/check-in/check-in-context";
import { NotificationCoordinator } from "../features/notifications/notification-coordinator";
import { TaskProvider } from "../features/tasks/task-context";
import { TemplateProvider } from "../features/templates/template-context";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <TaskProvider>
        <TemplateProvider>
          <BrainDumpProvider>
            <CheckInProvider>
              <NotificationCoordinator />
              <AppShell />
            </CheckInProvider>
          </BrainDumpProvider>
        </TemplateProvider>
      </TaskProvider>
    </SafeAreaProvider>
  );
}
