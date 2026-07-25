import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { useAuth } from "../../auth/auth-context";
import { AccessiblePressable as Pressable } from "../../accessibility/accessible-pressable";
import { useAppTheme } from "../../components/app-shell";
import { createBackupFileReader } from "../../data/create-backup-file-reader";
import { createExportFileWriter } from "../../data/create-export-file-writer";
import { useBrainDump } from "../brain-dump/brain-dump-context";
import { useCheckIns } from "../check-in/check-in-context";
import { useSettings } from "../settings/settings-context";
import { useTasks } from "../tasks/task-context";
import { useTemplates } from "../templates/template-context";
import { useSecurity } from "../../security/security-context";
import { useAppLock } from "../../security/app-lock-context";
import type { OrganaTheme } from "../../theme";
import { useAccountLifecycle } from "./account-lifecycle-context";
import { useDevices } from "./device-context";
import {
  createReadableJson,
  createReflectionMarkdown,
  restoreEncryptedBackup,
  type OrganaEncryptedBackup,
  type OrganaExportData,
} from "./export-data";

const backupReader = createBackupFileReader();
const exportWriter = createExportFileWriter();

export function AccountScreen() {
  const auth = useAuth();
  const security = useSecurity();
  const lifecycle = useAccountLifecycle();
  const deviceState = useDevices();
  const tasks = useTasks();
  const brainDump = useBrainDump();
  const checkIns = useCheckIns();
  const templates = useTemplates();
  const {
    loading: settingsLoading,
    restore: restoreSettings,
    settings,
    update: updateSettings,
  } = useSettings();
  const appLock = useAppLock();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const [signingOut, setSigningOut] = useState(false);
  const [busyExport, setBusyExport] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [busyDevice, setBusyDevice] = useState("");
  const [deviceApproval, setDeviceApproval] = useState<{
    code: string;
    deviceId: string;
    deviceName: string;
  }>();
  const [updatingLock, setUpdatingLock] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const identities = auth.user?.identities ?? [];
  const dataLoading =
    tasks.loading ||
    brainDump.loading ||
    checkIns.loading ||
    templates.loading ||
    settingsLoading;

  useEffect(() => {
    if (!deviceApproval) return;

    const target = deviceState.devices.find(
      (device) => device.id === deviceApproval.deviceId,
    );
    if (target?.trustedAt && !target.revokedAt) {
      setDeviceApproval(undefined);
      setMessage("Device joined. The one-time code is no longer needed.");
      return;
    }
    if (target && (!target.approvalRequestedAt || target.revokedAt)) {
      setDeviceApproval(undefined);
      setMessage("The device approval expired or was canceled.");
      return;
    }

    const expiresAt = target?.approvalExpiresAt
      ? new Date(target.approvalExpiresAt).getTime()
      : Number.NaN;
    if (!Number.isFinite(expiresAt)) return;

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      setDeviceApproval(undefined);
      setMessage("The device approval expired or was canceled.");
      return;
    }

    const timeout = setTimeout(() => {
      setDeviceApproval(undefined);
      setMessage("The device approval expired or was canceled.");
    }, remaining);
    return () => clearTimeout(timeout);
  }, [deviceApproval, deviceState.devices]);

  function exportData(): OrganaExportData {
    return {
      brainDump: brainDump.bullets,
      checkIns: checkIns.entries,
      exportedAt: new Date().toISOString(),
      format: "organa-readable-v1",
      settings,
      tasks: tasks.tasks,
      templates: templates.userTemplates,
    };
  }

  async function saveExport(
    kind: "structured" | "reflections" | "encrypted",
  ) {
    setBusyExport(kind);
    setError("");
    setMessage("");
    try {
      const data = exportData();
      const date = data.exportedAt.slice(0, 10);

      if (kind === "structured") {
        await exportWriter.save({
          contents: createReadableJson(data),
          filename: `organa-structured-${date}.json`,
          mimeType: "application/json",
        });
      } else if (kind === "reflections") {
        await exportWriter.save({
          contents: createReflectionMarkdown(data),
          filename: `organa-reflections-${date}.md`,
          mimeType: "text/markdown",
        });
      } else {
        if (!security.recoveryEnvelope) {
          throw new Error(
            "Encrypted backup requires a connected account with recovery set up.",
          );
        }
        const backupId = `full-${Date.now().toString(36)}`;
        const backup: OrganaEncryptedBackup = {
          backupId,
          encryptedAt: data.exportedAt,
          format: "organa-encrypted-backup-v1",
          payload: await security.encryptRecord("backup", backupId, data),
          recoveryKeyEnvelope: security.recoveryEnvelope,
        };
        await exportWriter.save({
          contents: JSON.stringify(backup, null, 2),
          filename: `organa-encrypted-backup-${date}.json`,
          mimeType: "application/json",
        });
      }

      setMessage("Export prepared on this device.");
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Export failed.",
      );
    } finally {
      setBusyExport("");
    }
  }

  async function requestDeletion() {
    if (deletionConfirmation !== "DELETE") return;
    setRequestingDeletion(true);
    setError("");
    try {
      await lifecycle.requestDeletion();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Deletion could not be requested.",
      );
      setRequestingDeletion(false);
    }
  }

  async function restoreBackup() {
    if (!recoveryCode.trim()) {
      setError("Enter the recovery code created with this backup.");
      return;
    }

    setRestoringBackup(true);
    setError("");
    setMessage("");
    try {
      const contents = await backupReader.pick();
      if (contents === null) return;

      const data = await restoreEncryptedBackup(contents, recoveryCode);
      const restored = await Promise.all([
        tasks.restoreTasks(data.tasks),
        templates.restoreTemplates(data.templates),
        checkIns.restoreEntries(data.checkIns),
        brainDump.restoreBullets(data.brainDump),
      ]);
      await restoreSettings(data.settings);

      const recordCount = restored.reduce((total, count) => total + count, 0);
      setRecoveryCode("");
      setMessage(
        `Backup restored. ${recordCount} ${
          recordCount === 1 ? "record was" : "records were"
        } merged and settings were applied.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The backup could not be restored.",
      );
    } finally {
      setRestoringBackup(false);
    }
  }

  async function configureDevice(
    deviceId: string,
    options: { makePrimary?: boolean; notificationsEnabled: boolean },
  ) {
    setBusyDevice(deviceId);
    setError("");
    try {
      await deviceState.configureReminders(deviceId, options);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Device settings could not be updated.",
      );
    } finally {
      setBusyDevice("");
    }
  }

  async function revokeDevice(deviceId: string) {
    setBusyDevice(deviceId);
    setError("");
    try {
      await deviceState.revoke(deviceId);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The device could not be revoked.",
      );
    } finally {
      setBusyDevice("");
    }
  }

  async function approveDevice(deviceId: string, deviceName: string) {
    setBusyDevice(deviceId);
    setError("");
    setMessage("");
    try {
      const code = await deviceState.approve(deviceId);
      setDeviceApproval({ code, deviceId, deviceName });
      setMessage(
        "Device approved. Enter the one-time code shown below on the new device.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The device could not be approved.",
      );
    } finally {
      setBusyDevice("");
    }
  }

  async function rejectDeviceApproval(deviceId: string) {
    setBusyDevice(deviceId);
    setError("");
    setMessage("");
    try {
      await deviceState.rejectApproval(deviceId);
      if (deviceApproval?.deviceId === deviceId) {
        setDeviceApproval(undefined);
      }
      setMessage("The device approval request was rejected.");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The device approval request could not be rejected.",
      );
    } finally {
      setBusyDevice("");
    }
  }

  async function toggleAppLock() {
    setUpdatingLock(true);
    setError("");
    try {
      await appLock.setEnabled(!appLock.enabled);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "App lock could not be updated.",
      );
    } finally {
      setUpdatingLock(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      await auth.signOut();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Sign-out failed.",
      );
      setSigningOut(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.page,
        compact ? styles.pageCompact : undefined,
      ]}
    >
      <Text style={styles.eyebrow}>ACCOUNT & PRIVACY</Text>
      <Text role="heading" style={styles.title}>
        Your space, your devices.
      </Text>
      <Text style={styles.subtitle}>
        Review how you signed in and where Organa keeps this account available.
      </Text>

      <View style={[styles.grid, compact ? styles.gridCompact : undefined]}>
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>SIGNED IN AS</Text>
          <Text style={styles.cardTitle}>
            {auth.localPreview
              ? "Local development preview"
              : (auth.user?.email ?? "Organa account")}
          </Text>
          <Text style={styles.cardText}>
            {auth.localPreview
              ? "This preview stays on this device and does not synchronize."
              : "Your authentication session is stored using platform-appropriate secure storage."}
          </Text>
          {identities.length > 0 ? (
            <View style={styles.identityList}>
              {identities.map((identity) => (
                <View key={identity.id} style={styles.identityPill}>
                  <Text style={styles.identityText}>
                    {capitalize(identity.provider)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>TRUSTED DEVICES</Text>
          <Text style={styles.cardTitle}>Reminder ownership</Text>
          <Text style={styles.cardText}>
            The primary device handles reminders. Enable a secondary device
            only when you want reminders there too. Revoking a device clears it
            when it reconnects and expires other account sessions.
          </Text>
          {auth.localPreview ? (
            <View style={styles.deviceRow}>
              <View style={styles.deviceDot} />
              <View style={styles.deviceCopy}>
                <Text style={styles.deviceTitle}>Local preview device</Text>
                <Text style={styles.deviceMeta}>
                  Reminders enabled for local testing
                </Text>
              </View>
              <View style={styles.currentPill}>
                <Text style={styles.currentText}>CURRENT</Text>
              </View>
            </View>
          ) : deviceState.loading ? (
            <ActivityIndicator
              color={theme.accentStrong}
              style={styles.deviceLoader}
            />
          ) : (
            deviceState.devices.map((device) => {
              const current = device.id === deviceState.currentDeviceId;
              const trusted = Boolean(device.trustedAt) && !device.revokedAt;
              const pendingApproval = Boolean(device.approvalRequestedAt);
              return (
                <View
                  key={device.id}
                  style={[
                    styles.devicePanel,
                    device.revokedAt ? styles.deviceRevoked : undefined,
                  ]}
                >
                  <View style={styles.deviceRow}>
                    <View
                      style={[
                        styles.deviceDot,
                        pendingApproval && !trusted
                          ? styles.deviceDotPending
                          : undefined,
                        device.revokedAt
                          ? styles.deviceDotRevoked
                          : undefined,
                      ]}
                    />
                    <View style={styles.deviceCopy}>
                      <Text style={styles.deviceTitle}>{device.name}</Text>
                      <Text style={styles.deviceMeta}>
                        {capitalize(device.platform)} /{" "}
                        {device.revokedAt
                          ? "revoked"
                          : !trusted
                            ? "awaiting approval"
                            : `seen ${formatLastSeen(device.lastSeenAt)}`}
                      </Text>
                    </View>
                    {current ? (
                      <View style={styles.currentPill}>
                        <Text style={styles.currentText}>CURRENT</Text>
                      </View>
                    ) : null}
                    {device.primaryReminder ? (
                      <View style={styles.primaryPill}>
                        <Text style={styles.primaryText}>PRIMARY</Text>
                      </View>
                    ) : null}
                    {pendingApproval ? (
                      <View style={styles.pendingPill}>
                        <Text style={styles.pendingText}>REQUEST</Text>
                      </View>
                    ) : null}
                  </View>
                  {pendingApproval && !current ? (
                    <View style={styles.deviceActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busyDevice === device.id}
                        style={styles.miniButton}
                        onPress={() =>
                          void approveDevice(device.id, device.name)
                        }
                      >
                        <Text style={styles.miniButtonText}>
                          Approve securely
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busyDevice === device.id}
                        style={[styles.miniButton, styles.revokeButton]}
                        onPress={() =>
                          void rejectDeviceApproval(device.id)
                        }
                      >
                        <Text
                          style={[
                            styles.miniButtonText,
                            styles.revokeButtonText,
                          ]}
                        >
                          Reject
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {trusted ? (
                    <View style={styles.deviceActions}>
                      {!device.primaryReminder ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={busyDevice === device.id}
                          style={styles.miniButton}
                          onPress={() =>
                            void configureDevice(device.id, {
                              makePrimary: true,
                              notificationsEnabled: true,
                            })
                          }
                        >
                          <Text style={styles.miniButtonText}>Make primary</Text>
                        </Pressable>
                      ) : null}
                      {!device.primaryReminder ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={busyDevice === device.id}
                          style={styles.miniButton}
                          onPress={() =>
                            void configureDevice(device.id, {
                              notificationsEnabled:
                                !device.notificationsEnabled,
                            })
                          }
                        >
                          <Text style={styles.miniButtonText}>
                            {device.notificationsEnabled
                              ? "Disable reminders"
                              : "Enable reminders"}
                          </Text>
                        </Pressable>
                      ) : null}
                      {!current ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={busyDevice === device.id}
                          style={[styles.miniButton, styles.revokeButton]}
                          onPress={() => void revokeDevice(device.id)}
                        >
                          <Text
                            style={[
                              styles.miniButtonText,
                              styles.revokeButtonText,
                            ]}
                          >
                            Revoke
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
          {deviceApproval ? (
            <View style={styles.approvalCodePanel}>
              <Text style={styles.approvalCodeTitle}>
                ONE-TIME CODE FOR {deviceApproval.deviceName.toUpperCase()}
              </Text>
              <Text selectable style={styles.approvalCode}>
                {deviceApproval.code}
              </Text>
              <Text style={styles.cardText}>
                Enter this code only on device{" "}
                {deviceApproval.deviceId.slice(0, 8).toUpperCase()}. It expires
                in 15 minutes and is never sent to Organa.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>DATA REGION</Text>
          <Text style={styles.cardTitle}>EU project required</Text>
          <Text style={styles.cardText}>
            Organa’s deployment checklist requires the connected Supabase
            project to be created in an EU region. The client never embeds a
            service-role key.
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                auth.configured
                  ? styles.statusDotReady
                  : styles.statusDotPending,
              ]}
            />
            <Text style={styles.statusText}>
              {auth.configured
                ? "Backend connection configured"
                : "Backend connection not configured"}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>APPEARANCE & FEEDBACK</Text>
          <Text style={styles.cardTitle}>Calm by default</Text>
          <Text style={styles.cardText}>
            Theme follows your system unless you choose otherwise. App sounds
            remain off until you enable them.
          </Text>
          <View style={styles.themeChoices}>
            {(["system", "light", "dark"] as const).map((choice) => (
              <Pressable
                key={choice}
                accessibilityLabel={`Use ${choice} theme`}
                accessibilityRole="radio"
                accessibilityState={{ checked: settings.theme === choice }}
                aria-checked={settings.theme === choice}
                style={[
                  styles.themeChoice,
                  settings.theme === choice
                    ? styles.themeChoiceActive
                    : undefined,
                ]}
                onPress={() => updateSettings({ theme: choice })}
              >
                <Text
                  style={[
                    styles.themeChoiceText,
                    settings.theme === choice
                      ? styles.themeChoiceTextActive
                      : undefined,
                  ]}
                >
                  {capitalize(choice)}
                </Text>
              </Pressable>
            ))}
          </View>
          <SettingToggle
            enabled={settings.appSoundsEnabled}
            label="Gentle task sounds"
            styles={styles}
            onPress={() =>
              updateSettings({
                appSoundsEnabled: !settings.appSoundsEnabled,
              })
            }
          />
          <SettingToggle
            enabled={settings.hapticsEnabled}
            label="Completion haptics"
            styles={styles}
            onPress={() =>
              updateSettings({ hapticsEnabled: !settings.hapticsEnabled })
            }
          />
          <SettingToggle
            disabled={!appLock.supported || updatingLock}
            enabled={appLock.enabled}
            label={
              appLock.supported
                ? "Lock with device authentication"
                : "App lock unavailable on this device"
            }
            styles={styles}
            onPress={() => void toggleAppLock()}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>LOCAL EXPORTS</Text>
          <Text style={styles.cardTitle}>Keep a copy you control</Text>
          <Text style={styles.cardText}>
            Files are assembled on this device from decrypted local data. They
            are not uploaded by Organa.
          </Text>
          <View style={styles.buttonStack}>
            <ExportButton
              busy={busyExport === "structured"}
              disabled={dataLoading}
              label="Tasks & settings / JSON"
              styles={styles}
              onPress={() => void saveExport("structured")}
            />
            <ExportButton
              busy={busyExport === "reflections"}
              disabled={dataLoading}
              label="Check-In & Brain Dump / Markdown"
              styles={styles}
              onPress={() => void saveExport("reflections")}
            />
            <ExportButton
              busy={busyExport === "encrypted"}
              disabled={dataLoading || !security.recoveryEnvelope}
              label="Encrypted full backup"
              styles={styles}
              onPress={() => void saveExport("encrypted")}
            />
          </View>
          <View style={styles.restoreSection}>
            <Text style={styles.restoreTitle}>Restore encrypted backup</Text>
            <Text style={styles.cardText}>
              Existing records are kept unless the backup contains a newer
              version. Imported data is encrypted again for this account.
            </Text>
            <TextInput
              accessibilityLabel="Recovery code for encrypted backup"
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Recovery code"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              style={styles.restoreInput}
              value={recoveryCode}
              onChangeText={setRecoveryCode}
            />
            <ExportButton
              busy={restoringBackup}
              disabled={dataLoading || !recoveryCode.trim()}
              label="Choose backup and restore"
              styles={styles}
              onPress={() => void restoreBackup()}
            />
          </View>
        </View>

        {!auth.localPreview ? (
          <View style={[styles.card, styles.dangerCard]}>
            <Text style={[styles.cardEyebrow, styles.dangerText]}>
              DELETE ACCOUNT
            </Text>
            <Text style={styles.cardTitle}>One-hour safety window</Text>
            <Text style={styles.cardText}>
              Type DELETE to begin. Organa becomes read-only immediately. You
              can cancel for one hour before cloud data, devices, and sessions
              are permanently removed.
            </Text>
            <TextInput
              accessibilityLabel="Type DELETE to confirm account deletion"
              autoCapitalize="characters"
              placeholder="Type DELETE"
              placeholderTextColor={theme.textMuted}
              style={styles.confirmInput}
              value={deletionConfirmation}
              onChangeText={setDeletionConfirmation}
            />
            <Pressable
              accessibilityLabel="Begin account deletion"
              accessibilityRole="button"
              disabled={
                deletionConfirmation !== "DELETE" || requestingDeletion
              }
              style={({ pressed }) => [
                styles.deleteButton,
                deletionConfirmation !== "DELETE"
                  ? styles.buttonDisabled
                  : undefined,
                pressed ? styles.buttonPressed : undefined,
              ]}
              onPress={() => void requestDeletion()}
            >
              {requestingDeletion ? (
                <ActivityIndicator color={theme.surface} />
              ) : (
                <Text style={styles.deleteButtonText}>
                  Begin account deletion
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>

      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={signingOut}
        style={styles.signOutButton}
        onPress={() => void signOut()}
      >
        {signingOut ? (
          <ActivityIndicator color={theme.must} />
        ) : (
          <Text style={styles.signOutText}>
            {auth.localPreview ? "Leave local preview" : "Sign out"}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function ExportButton({
  busy,
  disabled,
  label,
  styles,
  onPress,
}: {
  busy: boolean;
  disabled?: boolean;
  label: string;
  styles: ReturnType<typeof createStyles>;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.exportButton,
        disabled ? styles.buttonDisabled : undefined,
        pressed ? styles.buttonPressed : undefined,
      ]}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator />
      ) : (
        <Text style={styles.exportButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function SettingToggle({
  disabled,
  enabled,
  label,
  styles,
  onPress,
}: {
  disabled?: boolean;
  enabled: boolean;
  label: string;
  styles: ReturnType<typeof createStyles>;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled }}
      aria-checked={enabled}
      aria-disabled={disabled}
      disabled={disabled}
      style={[styles.settingRow, disabled ? styles.buttonDisabled : undefined]}
      onPress={onPress}
    >
      <Text style={styles.settingLabel}>{label}</Text>
      <View
        style={[
          styles.switchTrack,
          enabled ? styles.switchTrackEnabled : undefined,
        ]}
      >
        <View
          style={[
            styles.switchThumb,
            enabled ? styles.switchThumbEnabled : undefined,
          ]}
        />
      </View>
    </Pressable>
  );
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatLastSeen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function createStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    page: {
      alignSelf: "center",
      maxWidth: 1100,
      paddingBottom: 60,
      paddingHorizontal: 28,
      paddingTop: 34,
      width: "100%",
    },
    pageCompact: { paddingHorizontal: 16, paddingTop: 20 },
    eyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.8,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 34,
      letterSpacing: -1.4,
      marginTop: 7,
    },
    subtitle: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 13,
      lineHeight: 20,
      marginTop: 8,
      maxWidth: 620,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 16,
      marginTop: 28,
    },
    gridCompact: { flexDirection: "column" },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      flexBasis: 300,
      flexGrow: 1,
      minWidth: 280,
      padding: 20,
    },
    cardEyebrow: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 1.4,
    },
    cardTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 18,
      letterSpacing: -0.4,
      marginTop: 8,
    },
    cardText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 10,
      lineHeight: 16,
      marginTop: 9,
    },
    buttonDisabled: { opacity: 0.45 },
    buttonPressed: { opacity: 0.78 },
    buttonStack: { gap: 8, marginTop: 16 },
    confirmInput: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
      marginTop: 16,
      minHeight: 46,
      paddingHorizontal: 13,
    },
    dangerCard: { borderColor: theme.must },
    dangerText: { color: theme.must },
    deleteButton: {
      alignItems: "center",
      backgroundColor: theme.must,
      borderRadius: 12,
      justifyContent: "center",
      marginTop: 10,
      minHeight: 44,
      paddingHorizontal: 14,
    },
    deleteButtonText: {
      color: theme.surface,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
    },
    identityList: { flexDirection: "row", gap: 6, marginTop: 14 },
    identityPill: {
      backgroundColor: theme.shouldSoft,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    identityText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    deviceRow: {
      alignItems: "center",
      backgroundColor: theme.background,
      borderRadius: 13,
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
      padding: 12,
    },
    deviceDot: {
      backgroundColor: theme.accentStrong,
      borderRadius: 6,
      height: 9,
      width: 9,
    },
    deviceCopy: { flex: 1, minWidth: 0 },
    deviceActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 8,
      paddingHorizontal: 4,
    },
    deviceDotRevoked: { backgroundColor: theme.textMuted },
    deviceDotPending: { backgroundColor: theme.nice },
    deviceLoader: { alignSelf: "flex-start", marginTop: 18 },
    devicePanel: {
      backgroundColor: theme.background,
      borderRadius: 13,
      marginTop: 10,
      paddingBottom: 10,
    },
    deviceRevoked: { opacity: 0.55 },
    deviceTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
    },
    deviceMeta: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 8,
      marginTop: 2,
    },
    currentPill: {
      backgroundColor: theme.shouldSoft,
      borderRadius: 9,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    currentText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 6,
      letterSpacing: 0.8,
    },
    miniButton: {
      borderColor: theme.border,
      borderRadius: 9,
      borderWidth: 1,
      minHeight: 40,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    miniButtonText: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 8,
    },
    primaryPill: {
      backgroundColor: theme.niceSoft,
      borderRadius: 9,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    primaryText: {
      color: theme.nice,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 6,
      letterSpacing: 0.8,
    },
    pendingPill: {
      backgroundColor: theme.mustSoft,
      borderRadius: 9,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    pendingText: {
      color: theme.must,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 6,
      letterSpacing: 0.8,
    },
    approvalCodePanel: {
      backgroundColor: theme.shouldSoft,
      borderColor: theme.accentStrong,
      borderRadius: 13,
      borderWidth: 1,
      marginTop: 12,
      padding: 13,
    },
    approvalCodeTitle: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 7,
      letterSpacing: 1,
    },
    approvalCode: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
      lineHeight: 18,
      marginTop: 9,
    },
    revokeButton: { borderColor: theme.must },
    revokeButtonText: { color: theme.must },
    statusRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 16,
    },
    statusDot: { borderRadius: 5, height: 8, width: 8 },
    statusDotReady: { backgroundColor: theme.accentStrong },
    statusDotPending: { backgroundColor: theme.nice },
    statusText: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
    },
    settingLabel: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
    },
    settingRow: {
      alignItems: "center",
      borderTopColor: theme.border,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 48,
    },
    switchThumb: {
      backgroundColor: theme.textMuted,
      borderRadius: 8,
      height: 14,
      transform: [{ translateX: 2 }],
      width: 14,
    },
    switchThumbEnabled: {
      backgroundColor: theme.surface,
      transform: [{ translateX: 16 }],
    },
    switchTrack: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 10,
      height: 18,
      justifyContent: "center",
      width: 32,
    },
    switchTrackEnabled: { backgroundColor: theme.accentStrong },
    themeChoice: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      flex: 1,
      minHeight: 38,
      paddingVertical: 10,
    },
    themeChoiceActive: {
      backgroundColor: theme.accentStrong,
      borderColor: theme.accentStrong,
    },
    themeChoiceText: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    themeChoiceTextActive: { color: theme.surface },
    themeChoices: {
      flexDirection: "row",
      gap: 7,
      marginBottom: 4,
      marginTop: 16,
    },
    error: {
      color: theme.must,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
      marginTop: 18,
    },
    exportButton: {
      alignItems: "center",
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 11,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 12,
    },
    exportButtonText: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
    },
    restoreInput: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 11,
      borderWidth: 1,
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
      marginBottom: 8,
      marginTop: 12,
      minHeight: 42,
      paddingHorizontal: 12,
    },
    restoreSection: {
      borderTopColor: theme.border,
      borderTopWidth: 1,
      marginTop: 18,
      paddingTop: 17,
    },
    restoreTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 12,
    },
    message: {
      color: theme.accentStrong,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
      marginTop: 18,
    },
    signOutButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderColor: theme.must,
      borderRadius: 13,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: 24,
      minHeight: 42,
      minWidth: 110,
      paddingHorizontal: 17,
    },
    signOutText: {
      color: theme.must,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
    },
  });
}
