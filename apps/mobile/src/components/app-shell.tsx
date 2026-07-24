import { Slot, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { createContext, useContext } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AccessiblePressable as Pressable } from "../accessibility/accessible-pressable";
import { darkTheme, lightTheme, type OrganaTheme } from "../theme";
import { useSync } from "../sync/sync-context";
import { useSettings } from "../features/settings/settings-context";
import { useTasks } from "../features/tasks/task-context";

interface NavItem {
  href: "/" | "/check-in" | "/brain-dump" | "/templates" | "/account";
  shortLabel: string;
  label: string;
}

const navigation: NavItem[] = [
  { href: "/", shortLabel: "T", label: "Today" },
  { href: "/check-in", shortLabel: "C", label: "Check-In" },
  { href: "/brain-dump", shortLabel: "B", label: "Brain Dump" },
  { href: "/templates", shortLabel: "L", label: "Library" },
  { href: "/account", shortLabel: "A", label: "Account" },
];

interface AppShellContext {
  theme: OrganaTheme;
}

export function AppShell() {
  const systemScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const sync = useSync();
  const {
    clearReminderNotice: clearTaskReminderNotice,
    reminderNotice: taskReminderNotice,
  } = useTasks();
  const {
    checkInReminderNotice,
    clearCheckInReminderNotice,
    settings,
    update,
  } = useSettings();
  const reminderNotice = taskReminderNotice || checkInReminderNotice;
  const themeMode = settings.theme;
  const isWide = width >= 900;
  const effectiveMode =
    themeMode === "system" ? (systemScheme ?? "light") : themeMode;
  const theme = effectiveMode === "dark" ? darkTheme : lightTheme;
  const styles = createStyles(theme, isWide);

  function cycleTheme() {
    const next =
      themeMode === "system"
        ? "light"
        : themeMode === "light"
          ? "dark"
          : "system";
    update({ theme: next });
  }

  return (
    <AppShellThemeContext.Provider value={{ theme }}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={effectiveMode === "dark" ? "light" : "dark"} />
        {reminderNotice ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={styles.reminderNotice}
          >
            <Text style={styles.reminderNoticeText}>{reminderNotice}</Text>
            <Pressable
              accessibilityLabel="Dismiss reminder delivery notice"
              accessibilityRole="button"
              style={styles.reminderNoticeButton}
              onPress={
                taskReminderNotice
                  ? clearTaskReminderNotice
                  : clearCheckInReminderNotice
              }
            >
              <Text style={styles.reminderNoticeButtonText}>Dismiss</Text>
            </Pressable>
          </View>
        ) : null}
        {pathname === "/focus" ? (
          <View style={styles.focusShell}>
            <Slot />
          </View>
        ) : (
          <View style={styles.shell}>
            {isWide ? (
              <Sidebar
                styles={styles}
                theme={theme}
                themeMode={themeMode}
                syncLabel={formatSyncLabel(sync.status, sync.pending)}
                onCycleTheme={cycleTheme}
              />
            ) : (
              <MobileHeader
                styles={styles}
                themeMode={themeMode}
                onCycleTheme={cycleTheme}
              />
            )}
            <View style={styles.content}>
              <Slot />
            </View>
            {!isWide ? <MobileNavigation styles={styles} /> : null}
          </View>
        )}
      </SafeAreaView>
    </AppShellThemeContext.Provider>
  );
}

const AppShellThemeContext = createContext<AppShellContext | undefined>(
  undefined,
);

export function useAppTheme() {
  const context = useContext(AppShellThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used inside AppShell.");
  }

  return context.theme;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={brandStyles.row}>
      <View style={brandStyles.mark}>
        <View style={[brandStyles.bar, brandStyles.barTop]} />
        <View style={[brandStyles.bar, brandStyles.barMiddle]} />
        <View style={[brandStyles.bar, brandStyles.barBottom]} />
      </View>
      {!compact ? <Text style={brandStyles.wordmark}>organa</Text> : null}
    </View>
  );
}

function Sidebar({
  styles,
  theme,
  themeMode,
  syncLabel,
  onCycleTheme,
}: {
  styles: ReturnType<typeof createStyles>;
  theme: OrganaTheme;
  themeMode: string;
  syncLabel: string;
  onCycleTheme(): void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={styles.sidebar}>
      <BrandMark />
      <Text style={styles.navEyebrow}>YOUR SPACE</Text>
      <View style={styles.desktopNav}>
        {navigation.map((item) => {
          const active = pathname === item.href;
          return (
            <Pressable
              key={item.href}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              aria-selected={active}
              style={[
                styles.navItem,
                active ? styles.navItemActive : undefined,
              ]}
              onPress={() => router.push(item.href)}
            >
              <View
                style={[
                  styles.navGlyph,
                  active ? { backgroundColor: theme.accent } : undefined,
                ]}
              >
                <Text style={styles.navGlyphText}>{item.shortLabel}</Text>
              </View>
              <Text
                style={[
                  styles.navLabel,
                  active ? styles.navLabelActive : undefined,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.sidebarSpacer} />
      <Pressable
        accessibilityRole="button"
        style={styles.themeButton}
        onPress={onCycleTheme}
      >
        <Text style={styles.themeButtonLabel}>Theme: {themeMode}</Text>
      </Pressable>
      <View style={styles.syncPill}>
        <View style={styles.syncDot} />
        <Text style={styles.syncText}>{syncLabel}</Text>
      </View>
    </View>
  );
}

function formatSyncLabel(status: string, pending: number) {
  if (status === "local") return "Stored on this device";
  if (status === "syncing") return "Encrypting and syncing...";
  if (status === "offline") {
    return pending > 0
      ? `${pending} encrypted ${pending === 1 ? "change" : "changes"} waiting`
      : "Offline / up to date";
  }
  if (status === "error") return "Sync needs attention";
  return "Encrypted sync is current";
}

function MobileHeader({
  styles,
  themeMode,
  onCycleTheme,
}: {
  styles: ReturnType<typeof createStyles>;
  themeMode: string;
  onCycleTheme(): void;
}) {
  return (
    <View style={styles.mobileHeader}>
      <BrandMark />
      <Pressable
        accessibilityLabel={`Theme is ${themeMode}. Change theme.`}
        accessibilityRole="button"
        style={styles.mobileThemeButton}
        onPress={onCycleTheme}
      >
        <Text style={styles.mobileThemeText}>Aa</Text>
      </Pressable>
    </View>
  );
}

function MobileNavigation({
  styles,
}: {
  styles: ReturnType<typeof createStyles>;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={styles.mobileNav}>
      {navigation.map((item) => {
        const active = pathname === item.href;
        return (
          <Pressable
            key={item.href}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            style={styles.mobileNavItem}
            onPress={() => router.push(item.href)}
          >
            <Text
              style={[
                styles.mobileNavGlyph,
                active ? styles.mobileNavGlyphActive : undefined,
              ]}
            >
              {item.shortLabel}
            </Text>
            <Text
              style={[
                styles.mobileNavLabel,
                active ? styles.mobileNavLabelActive : undefined,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const brandStyles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  mark: {
    height: 30,
    position: "relative",
    width: 30,
  },
  bar: {
    backgroundColor: "#327061",
    borderRadius: 8,
    height: 6,
    position: "absolute",
  },
  barTop: {
    left: 0,
    top: 3,
    width: 20,
  },
  barMiddle: {
    right: 0,
    top: 12,
    width: 24,
  },
  barBottom: {
    bottom: 3,
    left: 4,
    width: 15,
  },
  wordmark: {
    color: "#327061",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 23,
    letterSpacing: -1,
  },
});

function createStyles(theme: OrganaTheme, isWide: boolean) {
  return StyleSheet.create({
    safeArea: {
      backgroundColor: theme.background,
      flex: 1,
    },
    reminderNotice: {
      alignItems: "center",
      backgroundColor: theme.shouldSoft,
      borderBottomColor: theme.should,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      paddingHorizontal: isWide ? 28 : 16,
      paddingVertical: 12,
    },
    reminderNoticeText: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 13,
      lineHeight: 19,
    },
    reminderNoticeButton: {
      borderColor: theme.text,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    reminderNoticeButtonText: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    shell: {
      backgroundColor: theme.background,
      flex: 1,
      flexDirection: isWide ? "row" : "column",
    },
    focusShell: {
      backgroundColor: theme.background,
      flex: 1,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    sidebar: {
      backgroundColor: theme.surface,
      borderRightColor: theme.border,
      borderRightWidth: 1,
      paddingBottom: 28,
      paddingHorizontal: 24,
      paddingTop: 28,
      width: 250,
    },
    navEyebrow: {
      color: theme.textMuted,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
      letterSpacing: 1.8,
      marginBottom: 12,
      marginTop: 48,
    },
    desktopNav: {
      gap: 8,
    },
    navItem: {
      alignItems: "center",
      borderRadius: 14,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    navItemActive: {
      backgroundColor: theme.shouldSoft,
    },
    navGlyph: {
      alignItems: "center",
      backgroundColor: theme.surfaceMuted,
      borderRadius: 10,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    navGlyphText: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 12,
    },
    navLabel: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 14,
    },
    navLabelActive: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
    },
    sidebarSpacer: {
      flex: 1,
    },
    themeButton: {
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 12,
      padding: 11,
    },
    themeButtonLabel: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
      textTransform: "capitalize",
    },
    syncPill: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      paddingVertical: 8,
    },
    syncDot: {
      backgroundColor: theme.should,
      borderRadius: 5,
      height: 8,
      width: 8,
    },
    syncText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 11,
    },
    mobileHeader: {
      alignItems: "center",
      backgroundColor: theme.background,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: Platform.OS === "web" ? 16 : 12,
    },
    mobileThemeButton: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    mobileThemeText: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
    },
    mobileNav: {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
      borderTopWidth: 1,
      flexDirection: "row",
      minHeight: 68,
      paddingBottom: Platform.OS === "ios" ? 10 : 6,
      paddingHorizontal: 8,
      paddingTop: 6,
    },
    mobileNavItem: {
      alignItems: "center",
      flex: 1,
      gap: 3,
      justifyContent: "center",
      minWidth: 0,
    },
    mobileNavGlyph: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 13,
    },
    mobileNavGlyphActive: {
      color: theme.accentStrong,
    },
    mobileNavLabel: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
      textAlign: "center",
    },
    mobileNavLabelActive: {
      color: theme.text,
    },
  });
}
