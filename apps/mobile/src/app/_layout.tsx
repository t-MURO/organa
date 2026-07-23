import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import Head from "expo-router/head";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthBoundary } from "../auth/auth-boundary";
import { AuthProvider } from "../auth/auth-context";
import { AppShell } from "../components/app-shell";
import { BrainDumpProvider } from "../features/brain-dump/brain-dump-context";
import { CheckInProvider } from "../features/check-in/check-in-context";
import { AccountLifecycleBoundary } from "../features/account/account-lifecycle-boundary";
import { AccountLifecycleProvider } from "../features/account/account-lifecycle-context";
import { DeviceProvider } from "../features/account/device-context";
import { NotificationCoordinator } from "../features/notifications/notification-coordinator";
import { WidgetCoordinator } from "../features/widgets/widget-coordinator";
import { PwaUpdateCoordinator } from "../features/updates/pwa-update-coordinator";
import { TaskProvider } from "../features/tasks/task-context";
import { TemplateProvider } from "../features/templates/template-context";
import { SettingsProvider } from "../features/settings/settings-context";
import { InteractionFeedbackProvider } from "../features/settings/interaction-feedback-context";
import { SecurityBoundary } from "../security/security-boundary";
import { SecurityProvider } from "../security/security-context";
import { AppLockBoundary } from "../security/app-lock-boundary";
import { AppLockProvider } from "../security/app-lock-context";
import { SyncProvider } from "../sync/sync-context";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <Head>
        <title>Organa</title>
      </Head>
    );
  }

  return (
    <>
      <Head>
        <title>Organa</title>
      </Head>
      <SafeAreaProvider>
        <PwaUpdateCoordinator />
        <AuthProvider>
          <AuthBoundary>
            <AppLockProvider>
              <AppLockBoundary>
                <SecurityProvider>
                  <SecurityBoundary>
                    <AccountLifecycleProvider>
                      <AccountLifecycleBoundary>
                        <SyncProvider>
                          <DeviceProvider>
                            <SettingsProvider>
                              <InteractionFeedbackProvider>
                                <TaskProvider>
                                  <TemplateProvider>
                                    <BrainDumpProvider>
                                      <CheckInProvider>
                                        <NotificationCoordinator />
                                        <WidgetCoordinator />
                                        <AppShell />
                                      </CheckInProvider>
                                    </BrainDumpProvider>
                                  </TemplateProvider>
                                </TaskProvider>
                              </InteractionFeedbackProvider>
                            </SettingsProvider>
                          </DeviceProvider>
                        </SyncProvider>
                      </AccountLifecycleBoundary>
                    </AccountLifecycleProvider>
                  </SecurityBoundary>
                </SecurityProvider>
              </AppLockBoundary>
            </AppLockProvider>
          </AuthBoundary>
        </AuthProvider>
      </SafeAreaProvider>
    </>
  );
}
