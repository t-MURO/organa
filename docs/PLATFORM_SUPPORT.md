# Controlled-Beta Platform Support

Status selected on 2026-07-24.

This document is the release compatibility contract for the Organa controlled
beta. A platform is supported only after its release checks pass on the exact
build being distributed. Versions outside this matrix may work, but they are
not beta release targets.

## Native Applications

Organa uses Expo SDK 57 and React Native 0.86. The source configuration pins:

| Platform | Supported versions | Build target | Distribution |
| --- | --- | --- | --- |
| iPhone and iPad | iOS/iPadOS 16.4 or newer | iOS deployment target 16.4 | Signed App Store/TestFlight build |
| Android phone and tablet | Android 7.0 (API 24) or newer | Compile SDK 36, target SDK 36 | Signed Play/internal-testing build |

Test the oldest supported OS and the current stable OS before each beta
release. The release may temporarily exclude a device or OS version when a
platform defect affects encryption, durable local storage, authentication,
reminders, or accessibility.

These targets follow the [Expo SDK 57 platform
contract](https://docs.expo.dev/versions/latest/), which lists Android 7+,
compile and target SDK 36, and iOS 16.4+.

## Web And PWA

The web application supports the current stable releases selected in
`docs/BROWSER_SUPPORT.md`:

- Safari on macOS and iOS
- Chrome on desktop and Android
- Edge on desktop
- Firefox on desktop

The browser matrix is intentionally version-relative because browsers update
independently of app releases. Record the exact tested browser versions in the
release evidence for every beta build.

## Capability Matrix

| Capability | iOS/iPadOS app | Android app | Web/PWA |
| --- | --- | --- | --- |
| Tasks, planning, templates, Focus | Supported | Supported | Supported |
| Check-In and Brain Dump | Supported | Supported | Supported |
| Encrypted local-first data and sync | Supported | Supported | Supported |
| Offline use after initial sign-in | Supported | Supported | Supported browser capability required |
| Local/system reminders | Native local notifications | Native local notifications | Web Push where available; active-tab fallback |
| Biometric or device-auth app lock | Supported | Supported | Not in MVP |
| Creation/completion sounds | Supported | Supported | Supported |
| Completion haptics | Supported | Supported | Not available |
| Today Tasks widget | Supported | Supported | Not applicable |
| Next Reminder widget | Supported | Supported | Not applicable |

The iOS implementation uses
[`expo-widgets`](https://docs.expo.dev/versions/latest/sdk/widgets/). Android
uses the Expo config plugin and headless task handler from
[`react-native-android-widget`](https://saleksovski.github.io/react-native-android-widget/docs/tutorial/register-widget-expo).
Both platforms render Today Tasks and Next Reminder, support app deep links,
and replace private content with signed-out states. Android stores a bounded
widget transition timeline in SecureStore and resolves it during app-driven or
30-minute launcher updates.

Web system reminders require HTTPS, a configured VAPID key, permission, and
browser Push support. iOS/iPadOS Web Push requires an installed Home Screen
PWA. The complete browser behavior and fallback contract is in
`docs/BROWSER_SUPPORT.md`.

## Release Checks

For every native beta build:

1. Build signed iOS and Android release artifacts from the tagged source.
2. Exercise critical workflows on the oldest supported OS.
3. Repeat the smoke suite on the current stable OS.
4. Verify account recovery, encrypted local persistence, offline restart, and
   reconnect synchronization.
5. Verify notification permission, scheduling, snooze, completion, deep
   links, and killed-process delivery.
6. Verify biometric or device-auth lock behavior.
7. Run VoiceOver on iOS and TalkBack on Android with enlarged text.
8. Verify light, dark, system, reduced-motion, sound, and haptic preferences.
9. On iOS/iPadOS and Android, verify both widgets, supported resize states,
   timeline rollover, content-free signed-out state, and deep links.

For every web beta release, follow all checks in `docs/BROWSER_SUPPORT.md` and
record the exact browser versions.

## Review Policy

Re-evaluate this matrix before upgrading Expo SDK, React Native, Android API
targets, or the iOS deployment target. A version change requires regenerated
native projects, strict typechecking, all automated tests, both Hermes
exports, a production PWA export, and the physical release checks above.
