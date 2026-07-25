import type { PropsWithChildren } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AccessiblePressable as Pressable } from "../accessibility/accessible-pressable";
import { useAuth } from "../auth/auth-context";
import { darkTheme, lightTheme, type OrganaTheme } from "../theme";
import { useSecurity } from "./security-context";

export function SecurityBoundary({ children }: PropsWithChildren) {
  const auth = useAuth();
  const ownerId = auth.localPreview
    ? "local-preview"
    : (auth.user?.id ?? "signed-out");
  return (
    <AccountSecurityBoundary key={ownerId}>{children}</AccountSecurityBoundary>
  );
}

function AccountSecurityBoundary({ children }: PropsWithChildren) {
  const security = useSecurity();
  const auth = useAuth();
  const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;
  const styles = createStyles(theme);
  const [confirmed, setConfirmed] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [approvalInput, setApprovalInput] = useState("");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");

  async function confirmRecovery() {
    setBusy("confirm-recovery");
    setActionError("");
    try {
      await security.confirmRecoverySaved();
      setConfirmed(false);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The recovery setup could not be saved.",
      );
    } finally {
      setBusy("");
    }
  }

  async function restore() {
    setBusy("restore-recovery");
    setActionError("");
    try {
      await security.restoreWithRecoveryCode(recoveryInput);
      setRecoveryInput("");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The recovery key could not be used.",
      );
    } finally {
      setBusy("");
    }
  }

  async function requestApproval() {
    setBusy("request-approval");
    setActionError("");
    setApprovalInput("");
    try {
      await security.requestTrustedDeviceApproval();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The trusted-device request could not be created.",
      );
    } finally {
      setBusy("");
    }
  }

  async function refreshApproval() {
    setBusy("refresh-approval");
    setActionError("");
    try {
      await security.refreshDeviceApproval();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The device approval status could not be refreshed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function restoreFromApproval() {
    setBusy("restore-approval");
    setActionError("");
    try {
      await security.restoreWithApprovalCode(approvalInput);
      setApprovalInput("");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The one-time approval code could not be used.",
      );
    } finally {
      setBusy("");
    }
  }

  if (security.loading) {
    return (
      <SafeAreaView
        accessibilityLabel="Opening encrypted space"
        role="main"
        style={[styles.safeArea, styles.center]}
      >
        <ActivityIndicator color={theme.accentStrong} />
        <Text role="status" style={styles.loadingText}>
          Unlocking your private space...
        </Text>
      </SafeAreaView>
    );
  }

  if (
    security.contentKey &&
    !security.recoveryCode &&
    !security.restoreRequired
  ) {
    return children;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page} role="main">
        <View style={styles.card}>
          <Text aria-hidden={true} style={styles.brand}>
            organa
          </Text>
          {security.recoveryCode ? (
            <>
              <Text style={styles.eyebrow}>ONE-TIME RECOVERY SETUP</Text>
              <Text role="heading" style={styles.title}>
                Keep the key to your space.
              </Text>
              <Text style={styles.description}>
                This recovery key is the only way to restore your encrypted
                content if every trusted device is lost. Organa cannot recover
                it for you.
              </Text>
              <View style={styles.recoveryBox}>
                <Text selectable style={styles.recoveryCode}>
                  {security.recoveryCode}
                </Text>
              </View>
              <Text style={styles.hint}>
                Store it in a password manager or another safe place. Do not
                keep the only copy on this device.
              </Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: confirmed }}
                aria-checked={confirmed}
                style={styles.confirmRow}
                onPress={() => setConfirmed((current) => !current)}
              >
                <View
                  style={[
                    styles.checkbox,
                    confirmed ? styles.checkboxChecked : undefined,
                  ]}
                >
                  {confirmed ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={styles.confirmText}>
                  I stored this recovery key somewhere safe.
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!confirmed || Boolean(busy)}
                style={[
                  styles.primaryButton,
                  !confirmed ? styles.primaryButtonDisabled : undefined,
                ]}
                onPress={() => void confirmRecovery()}
              >
                <Text style={styles.primaryButtonText}>
                  {busy === "confirm-recovery"
                    ? "Securing account..."
                    : "Continue to Organa"}
                </Text>
              </Pressable>
            </>
          ) : security.restoreRequired ? (
            <>
              <Text style={styles.eyebrow}>NEW DEVICE</Text>
              <Text role="heading" style={styles.title}>
                Unlock your encrypted content.
              </Text>
              <Text style={styles.description}>
                Enter the recovery key you stored when this account was created.
                It is processed on this device and is never sent to Organa.
              </Text>
              <TextInput
                accessibilityLabel="Recovery key"
                autoCapitalize="characters"
                autoCorrect={false}
                multiline
                placeholder="ORG1-XXXX-XXXX-..."
                placeholderTextColor={theme.textMuted}
                style={[styles.input, styles.recoveryInput]}
                value={recoveryInput}
                onChangeText={setRecoveryInput}
              />
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(busy)}
                style={styles.primaryButton}
                onPress={() => void restore()}
              >
                <Text style={styles.primaryButtonText}>
                  {busy === "restore-recovery"
                    ? "Unlocking..."
                    : "Unlock with recovery key"}
                </Text>
              </Pressable>
              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.divider} />
              </View>
              {security.approvalRequest ? (
                <View style={styles.approvalPanel}>
                  <Text style={styles.approvalTitle}>
                    {security.approvalRequest.approved
                      ? "A trusted device approved this request."
                      : "Waiting for a trusted device"}
                  </Text>
                  <Text style={styles.hint}>
                    Request {security.device?.id.slice(0, 8).toUpperCase()} /
                    expires{" "}
                    {formatExpiry(security.approvalRequest.expiresAt)}
                  </Text>
                  {security.approvalRequest.approved ? (
                    <>
                      <TextInput
                        accessibilityLabel="One-time device approval code"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        multiline
                        placeholder="ODA1-XXXX-XXXX-..."
                        placeholderTextColor={theme.textMuted}
                        style={[styles.input, styles.approvalInput]}
                        value={approvalInput}
                        onChangeText={setApprovalInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={!approvalInput.trim() || Boolean(busy)}
                        style={[
                          styles.primaryButton,
                          !approvalInput.trim()
                            ? styles.primaryButtonDisabled
                            : undefined,
                        ]}
                        onPress={() => void restoreFromApproval()}
                      >
                        <Text style={styles.primaryButtonText}>
                          {busy === "restore-approval"
                            ? "Verifying approval..."
                            : "Unlock with approval code"}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busy)}
                    style={styles.secondaryButton}
                    onPress={() => void refreshApproval()}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {busy === "refresh-approval"
                        ? "Checking..."
                        : "Check approval status"}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.description}>
                    Or ask another device already signed into this account to
                    approve this one from Account & Privacy.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busy)}
                    style={styles.secondaryButton}
                    onPress={() => void requestApproval()}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {busy === "request-approval"
                        ? "Creating request..."
                        : "Ask a trusted device"}
                    </Text>
                  </Pressable>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>ENCRYPTION SETUP PAUSED</Text>
              <Text role="heading" style={styles.title}>
                Your data stayed closed.
              </Text>
              <Text style={styles.description}>
                {security.error ||
                  "Organa could not prepare the account encryption key."}
              </Text>
            </>
          )}

          {actionError || security.error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {actionError || security.error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            style={styles.signOutButton}
            onPress={() => void auth.signOut()}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: OrganaTheme) {
  return StyleSheet.create({
    safeArea: { backgroundColor: theme.background, flex: 1 },
    center: { alignItems: "center", gap: 12, justifyContent: "center" },
    loadingText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
    },
    page: {
      alignItems: "center",
      flexGrow: 1,
      justifyContent: "center",
      padding: 20,
    },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 26,
      borderWidth: 1,
      maxWidth: 620,
      padding: 30,
      width: "100%",
    },
    brand: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 22,
      letterSpacing: -0.8,
      marginBottom: 34,
    },
    eyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.7,
    },
    title: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 30,
      letterSpacing: -1.2,
      lineHeight: 36,
      marginTop: 9,
    },
    description: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 12,
      lineHeight: 19,
      marginTop: 10,
    },
    recoveryBox: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 15,
      borderWidth: 1,
      marginTop: 22,
      padding: 17,
    },
    recoveryCode: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 12,
      letterSpacing: 0.7,
      lineHeight: 22,
      textAlign: "center",
    },
    hint: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      lineHeight: 14,
      marginTop: 10,
    },
    confirmRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 11,
      marginTop: 22,
    },
    checkbox: {
      borderColor: theme.accentStrong,
      borderRadius: 6,
      borderWidth: 1.5,
      height: 23,
      width: 23,
    },
    checkboxChecked: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      justifyContent: "center",
    },
    checkmark: {
      color: theme.background,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
    },
    confirmText: {
      color: theme.text,
      flex: 1,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
    },
    input: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      padding: 14,
    },
    recoveryInput: {
      minHeight: 92,
      marginTop: 20,
      textAlignVertical: "top",
    },
    approvalInput: {
      minHeight: 74,
      marginTop: 14,
      textAlignVertical: "top",
    },
    approvalPanel: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 15,
      borderWidth: 1,
      marginTop: 6,
      padding: 15,
    },
    approvalTitle: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    divider: { backgroundColor: theme.border, flex: 1, height: 1 },
    dividerRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginVertical: 20,
    },
    dividerText: {
      color: theme.textMuted,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 14,
      marginTop: 22,
      padding: 14,
    },
    primaryButtonDisabled: { opacity: 0.42 },
    primaryButtonText: {
      color: theme.background,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: theme.accentStrong,
      borderRadius: 14,
      borderWidth: 1,
      marginTop: 14,
      padding: 13,
    },
    secondaryButtonText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
    },
    error: {
      color: theme.must,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
      lineHeight: 14,
      marginTop: 14,
    },
    signOutButton: { alignSelf: "center", marginTop: 18, padding: 8 },
    signOutText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
    },
  });
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
