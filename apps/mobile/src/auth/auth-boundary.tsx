import type { PropsWithChildren } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AccessiblePressable as Pressable } from "../accessibility/accessible-pressable";
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView,
} from "../components/keyboard";
import { TextInput } from "../components/themed-text-input";
import { darkTheme, lightTheme, type OrganaTheme } from "../theme";
import { StyleSheet } from "../typography";
import { useAuth } from "./auth-context";

export function AuthBoundary({ children }: PropsWithChildren) {
  const auth = useAuth();
  const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;

  if (auth.loading) {
    return (
      <SafeAreaView
        accessibilityLabel="Opening Organa"
        role="main"
        style={[stylesFor(theme).safeArea, stylesFor(theme).center]}
      >
        <ActivityIndicator color={theme.accentStrong} />
        <Text role="status" style={stylesFor(theme).loadingText}>
          Opening your space...
        </Text>
      </SafeAreaView>
    );
  }

  if (auth.session || auth.localPreview) return children;
  return <SignInScreen />;
}

function SignInScreen() {
  const auth = useAuth();
  const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;
  const styles = stylesFor(theme);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const displayedError = error || auth.authError;
  const secondaryHeadingProps =
    Platform.OS === "web" ? { "aria-level": 2 as const } : {};

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    auth.clearAuthError();
    try {
      await action();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Sign-in could not be completed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function sendCode() {
    if (!email.trim()) {
      setError("Enter the email address you want to use.");
      return;
    }
    await run("email", async () => {
      await auth.sendEmailCode(email.trim());
      setCodeSent(true);
    });
  }

  async function verifyCode() {
    if (!code.trim()) {
      setError("Enter the verification code from your email.");
      return;
    }
    await run("verify", () =>
      auth.verifyEmailCode(email.trim(), code.trim()),
    );
  }

  async function signInLocally() {
    await run("local", () => auth.signInLocally(email));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.safeArea}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={styles.authPage}
          role="main"
        >
          <View aria-hidden style={styles.ambientOne} />
          <View aria-hidden style={styles.ambientTwo} />
          <View style={styles.authLayout}>
            <View style={styles.authIntro}>
              <View style={styles.brandRow}>
                <View aria-hidden style={styles.brandMark}>
                  <View style={[styles.brandBar, styles.brandBarOne]} />
                  <View style={[styles.brandBar, styles.brandBarTwo]} />
                  <View style={[styles.brandBar, styles.brandBarThree]} />
                </View>
                <Text style={styles.brand}>organa</Text>
              </View>
              <Text style={styles.introEyebrow}>CALM CONTROL FOR REAL DAYS</Text>
              <Text role="heading" style={styles.introTitle}>
                A little more room to think.
              </Text>
              <Text style={styles.introText}>
                Keep tasks, routines, reminders, and loose thoughts together
                without turning your life into a performance dashboard.
              </Text>
              <View role="list" style={styles.promiseList}>
                <Promise styles={styles} text="Offline after your first sign-in" />
                <Promise styles={styles} text="Private, encrypted sync" />
                <Promise styles={styles} text="No streak pressure or tracking" />
              </View>
            </View>

            <View
              accessibilityLabel={
                auth.configured
                  ? "Sign in to Organa"
                  : auth.localDevelopmentEnabled
                    ? "Local development sign in"
                    : "Backend setup required"
              }
              role="region"
              style={styles.authCard}
            >
              <Text style={styles.cardEyebrow}>
                {auth.configured
                  ? "YOUR PRIVATE SPACE"
                  : auth.localDevelopmentEnabled
                    ? "LOCAL DEVELOPMENT"
                    : "SETUP REQUIRED"}
              </Text>
              <Text
                {...secondaryHeadingProps}
                role="heading"
                style={styles.cardTitle}
              >
                {auth.configured
                  ? "Come in gently."
                  : auth.localDevelopmentEnabled
                    ? "Test without waiting."
                    : "Connect the backend."}
              </Text>
              <Text style={styles.cardText}>
                {auth.configured
                  ? "Enter your email and Organa will send a one-time verification code."
                  : auth.localDevelopmentEnabled
                    ? "Enter any test email to open a local-only account instantly."
                    : auth.configurationIssue}
              </Text>

              {auth.configured || auth.localDevelopmentEnabled ? (
                <>
                  <Text style={styles.fieldLabel}>Email address</Text>
                  <TextInput
                    accessibilityLabel="Email address"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    placeholder="you@example.com"
                    placeholderTextColor={theme.textMuted}
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                  />
                </>
              ) : null}

              {auth.configured ? (
                codeSent ? (
                  <>
                    <Text style={styles.sentText}>
                      A verification code is on its way. It may take a minute.
                    </Text>
                    <Text style={styles.fieldLabel}>Verification code</Text>
                    <TextInput
                      accessibilityLabel="Verification code"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      placeholder="123456"
                      placeholderTextColor={theme.textMuted}
                      style={styles.input}
                      value={code}
                      onChangeText={setCode}
                      onSubmitEditing={() => void verifyCode()}
                    />
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(busy)}
                      style={styles.primaryButton}
                      onPress={() => void verifyCode()}
                    >
                      <Text style={styles.primaryButtonText}>
                        {busy === "verify" ? "Checking..." : "Verify code"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.linkButton}
                      onPress={() => void sendCode()}
                    >
                      <Text style={styles.linkText}>Send another code</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busy)}
                    style={styles.primaryButton}
                    onPress={() => void sendCode()}
                  >
                    <Text style={styles.primaryButtonText}>
                      {busy === "email"
                        ? "Sending..."
                        : "Send verification code"}
                    </Text>
                  </Pressable>
                )
              ) : null}

              {auth.localDevelopmentEnabled ? (
                <View style={styles.localDevelopmentBox}>
                  <Text style={styles.localDevelopmentEyebrow}>
                    FRONTEND TESTING
                  </Text>
                  <Text style={styles.localDevelopmentText}>
                    Skip email delivery and keep this account entirely on this
                    device. Each test email gets separate local data.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busy)}
                    style={styles.previewButton}
                    onPress={() => void signInLocally()}
                  >
                    <Text style={styles.previewButtonText}>
                      {busy === "local"
                        ? "Opening local account..."
                        : "Continue locally"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {!auth.configured ? (
                <View style={styles.configBox}>
                  <Text style={styles.configHint}>
                    Cloud sign-in remains unavailable until these values are
                    configured:
                  </Text>
                  <Text style={styles.configKey}>
                    EXPO_PUBLIC_SUPABASE_URL
                  </Text>
                  <Text style={styles.configKey}>
                    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
                  </Text>
                </View>
              ) : null}

              {displayedError ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {displayedError}
                </Text>
              ) : null}
              <Text style={styles.privacyNote}>
                Your personal content is not used for advertising or behavioral
                analytics.
              </Text>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Promise({
  styles,
  text,
}: {
  styles: ReturnType<typeof stylesFor>;
  text: string;
}) {
  return (
    <View role="listitem" style={styles.promise}>
      <View aria-hidden style={styles.promiseDot} />
      <Text style={styles.promiseText}>{text}</Text>
    </View>
  );
}

function stylesFor(theme: OrganaTheme) {
  return StyleSheet.create({
    safeArea: { backgroundColor: theme.background, flex: 1 },
    center: { alignItems: "center", gap: 12, justifyContent: "center" },
    loadingText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 12,
    },
    authPage: {
      flexGrow: 1,
      justifyContent: "center",
      overflow: "hidden",
      padding: 24,
      position: "relative",
    },
    ambientOne: {
      backgroundColor: theme.shouldSoft,
      borderRadius: 300,
      height: 520,
      opacity: 0.55,
      position: "absolute",
      right: -180,
      top: -240,
      width: 520,
    },
    ambientTwo: {
      backgroundColor: theme.niceSoft,
      borderRadius: 230,
      bottom: -240,
      height: 440,
      left: -180,
      opacity: 0.38,
      position: "absolute",
      width: 440,
    },
    authLayout: {
      alignItems: "center",
      alignSelf: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 60,
      justifyContent: "center",
      maxWidth: 1080,
      width: "100%",
    },
    authIntro: { flex: 1, maxWidth: 460, minWidth: 290 },
    brandRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 11,
      marginBottom: 48,
    },
    brandMark: { height: 30, position: "relative", width: 30 },
    brandBar: {
      backgroundColor: theme.accentStrong,
      borderRadius: 5,
      height: 6,
      position: "absolute",
    },
    brandBarOne: { left: 0, top: 3, width: 20 },
    brandBarTwo: { right: 0, top: 12, width: 24 },
    brandBarThree: { bottom: 3, left: 4, width: 15 },
    brand: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 24,
      letterSpacing: -1,
    },
    introEyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 9,
      letterSpacing: 1.8,
    },
    introTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 45,
      letterSpacing: -2.2,
      lineHeight: 51,
      marginTop: 13,
    },
    introText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 14,
      lineHeight: 22,
      marginTop: 16,
      maxWidth: 430,
    },
    promiseList: { gap: 10, marginTop: 28 },
    promise: { alignItems: "center", flexDirection: "row", gap: 10 },
    promiseDot: {
      backgroundColor: theme.accentStrong,
      borderRadius: 5,
      height: 7,
      width: 7,
    },
    promiseText: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 11,
    },
    authCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 26,
      borderWidth: 1,
      maxWidth: 430,
      minWidth: 300,
      padding: 28,
      width: "100%",
    },
    cardEyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 1.5,
    },
    cardTitle: {
      color: theme.text,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 25,
      letterSpacing: -0.9,
      marginTop: 7,
    },
    cardText: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 7,
    },
    fieldLabel: {
      color: theme.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 10,
      marginBottom: 7,
      marginTop: 10,
    },
    input: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      color: theme.text,
      fontFamily: "Manrope_400Regular",
      fontSize: 12,
      paddingHorizontal: 13,
      paddingVertical: 12,
    },
    sentText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
      lineHeight: 14,
      marginTop: 12,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.accentStrong,
      borderRadius: 13,
      marginTop: 13,
      paddingVertical: 13,
    },
    primaryButtonText: {
      color: theme.background,
      fontFamily: "Manrope_700Bold",
      fontSize: 11,
    },
    linkButton: { alignItems: "center", padding: 10 },
    linkText: {
      color: theme.textMuted,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
    },
    configBox: {
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      gap: 8,
      marginTop: 20,
      padding: 14,
    },
    configHint: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      lineHeight: 14,
    },
    configKey: {
      color: theme.text,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
    },
    localDevelopmentBox: {
      backgroundColor: theme.shouldSoft,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      marginTop: 18,
      padding: 14,
    },
    localDevelopmentEyebrow: {
      color: theme.accentStrong,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 8,
      letterSpacing: 1.2,
    },
    localDevelopmentText: {
      color: theme.text,
      fontFamily: "Manrope_400Regular",
      fontSize: 9,
      lineHeight: 14,
      marginTop: 6,
    },
    previewButton: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderRadius: 11,
      marginTop: 12,
      padding: 11,
    },
    previewButtonText: {
      color: theme.accentStrong,
      fontFamily: "Manrope_700Bold",
      fontSize: 9,
    },
    error: {
      color: theme.must,
      fontFamily: "Manrope_600SemiBold",
      fontSize: 9,
      lineHeight: 14,
      marginTop: 12,
    },
    privacyNote: {
      color: theme.textMuted,
      fontFamily: "Manrope_400Regular",
      fontSize: 8,
      lineHeight: 13,
      marginTop: 18,
      textAlign: "center",
    },
  });
}
