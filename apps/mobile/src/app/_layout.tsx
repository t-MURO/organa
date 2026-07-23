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
import { TaskProvider } from "../features/tasks/task-context";

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
        <BrainDumpProvider>
          <CheckInProvider>
            <AppShell />
          </CheckInProvider>
        </BrainDumpProvider>
      </TaskProvider>
    </SafeAreaProvider>
  );
}
