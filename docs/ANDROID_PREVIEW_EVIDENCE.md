# Android Preview Build Evidence

Status recorded on 2026-07-26.

## Successful Artifact

- EAS project: `@t-muro/organa`
- Build ID: `ab87af86-5fee-4af9-b0d6-6f52d9f7e77f`
- Source commit: `8cd8dd5d2439db7e93d6586a76b5998e27af9511`
- Profile and distribution: `preview`, internal APK
- App version and build: `0.1.0` (`4`)
- Terminal status: `FINISHED`
- Cloud build duration: 788 seconds
- Artifact size: 111,770,938 bytes
- Artifact SHA-256:
  `55691f3e619b4819dd2ba900380205b45564e9c9b2e7df6f117a171cd5d478fd`
- EAS record:
  <https://expo.dev/accounts/t-muro/projects/organa/builds/ab87af86-5fee-4af9-b0d6-6f52d9f7e77f>

The downloaded APK passes complete ZIP integrity validation. Android's
`apksig` verifier `8.12.0` reports one signer, a valid APK Signature Scheme v2
signature, no errors or warnings, and an overall verified result. Its signer
certificate exactly matches the previous successful preview APK, allowing an
in-place update that preserves the installed app's local encrypted state. Its
higher Android version code makes that replacement unambiguous. The checksum
and signature result apply only to the artifact identified above.

The matching EAS `preview` client environment passed Organa's three-field,
value-redacting release preflight before the build. The `production`
environment independently passed the same preflight. This evidence records
only validation status; no environment value or signing credential belongs in
the repository.

## Preview Purpose

This replacement includes per-record isolation for task-type pulls, durable
reconciliation pages, and same-timestamp pagination. One cloud record that
cannot be opened no longer prevents valid later records from reaching Android.
The failed record remains retryable because reconciliation does not advance its
durable cursor after a partial delivery failure.

A user-confirmed retry on the preceding version-code-1 artifact showed that
isolation alone did not repair the native read failure. This version decodes
stored combined AES envelopes from base64 into bytes before handing them to
Expo Crypto's Android parser. The shared boundary covers encrypted records,
recovery, and both device-approval formats without changing AES-GCM metadata,
key-ID, or additional-data validation.

This build also includes the larger shared typography scale, stable checkbox
and Undo action geometry, platform keyboard avoidance across app and modal
input surfaces, explicit Android resize behavior, and themed cursor, selection,
and focus treatment. The completed version-code-3 typography-only artifact was
superseded before delivery so version 4 contains the full set of changes.

## Resolved Build Finding

The first clean preview attempt, build
`d7f3e34d-e519-47de-aa1a-21d35c789f81`, reached Gradle but failed
`:app:checkReleaseDuplicateClasses`. Expo Widgets' Glance dependency introduced
`androidx.work:work-runtime-ktx:2.7.1`, while
`react-native-android-widget` introduced `work-runtime:2.8.1`; those versions
both contained the affected Kotlin request classes.

Commit `4faf6e6e2f4369a1cb95adb19146879b1a8d1ede` adds an idempotent Expo config
plugin that aligns `work-runtime` and `work-runtime-ktx` at `2.8.1` in the
generated app Gradle dependencies. The platform verifier confirms the source
plugin and generated output. The first successful retry, build
`812d5e0c-5e26-40a5-9652-a95332fd23c3` from commit
`4faf6e6e2f4369a1cb95adb19146879b1a8d1ede`, passed the formerly failing
duplicate-class task and completed release assembly and signing.

## Local Verification

- `pnpm typecheck` passes.
- `pnpm verify:security` passes 18 checks.
- `pnpm verify:platform` passes 24 source/generated checks.
- `pnpm build:native` exports both iOS and Android Hermes bundles.
- `pnpm build:web` passes 28 artifact checks with 23 precache URLs.
- `pnpm audit --prod --json` reports zero findings at every severity.
- No tests were added, changed, or run.

## Local Firebase-enabled Artifact

Status recorded on 2026-07-27.

- Source commit: `58580c6d9974ade2c75d7a9963e5720258890147`
- Profile and distribution: `local-preview`, internal APK
- App version and build: `0.1.0` (`9`)
- Artifact size: 111,812,858 bytes
- Artifact SHA-256:
  `856244b4ec87ee8ae3aa5c9286103c3d9fd9dd27473d3e13785af34fa4aca7db`
- Local artifact: `~/Downloads/Organa-0.1.0-build-9.apk`

The host now has a complete local Android build toolchain using Java 17,
Android API 36/build tools, platform tools, NDK 27.1, and CMake. Expo Doctor
passes all 20 checks, Expo Prebuild succeeds, and Gradle completes
`:app:assembleRelease`.

The local build resolves the checked-in public Android Firebase client
configuration for package `app.organa.mobile` and completes
`:app:processReleaseGoogleServices`. APK inspection confirms version code 9,
minimum API 24, target API 36, all four native ABIs, notification and FCM
receive permissions, Expo/Firebase messaging services, and the expected
Firebase project ID, app ID, sender ID, and storage bucket resources.

Android `apksigner` verifies one RSA signer with a valid APK Signature Scheme
v2 signature. This is build and static-artifact evidence only; notification
delivery and device-approval behavior still require a physical-device check.
No tests were added, changed, or run for the local build.

## Email-Only Version 12 Artifact

Status recorded on 2026-07-27.

- Source commit: `092f72218f177b3c877495406a5d4064025d0171`
- Profile and distribution: `local-preview`, internal APK
- App version and build: `0.1.0` (`12`)
- Artifact size: 111,707,642 bytes
- Artifact SHA-256:
  `c4e24005ce33b9c6c0553e215ef5988904322421c87a81b18c72443293ef70bc`
- Local artifact: `artifacts/organa-preview-v12.apk`

This build follows the complete removal of Google/GitHub sign-in. EAS local
prebuild regenerated the Android project from source, and its linked Expo
module list no longer contains the removed browser-Auth module. Firebase
Google Services processing remains enabled only for Android notifications.

Expo Doctor passes all 20 checks. Gradle completes all 606 release tasks,
including Google Services processing, duplicate-class validation, release
lint, signing validation, and `:app:assembleRelease`.

Static inspection confirms package `app.organa.mobile`, version code 12,
minimum API 24, target/compile API 36, all four native ABIs, notification and
FCM permissions, and a valid single-signer APK Signature Scheme v2 signature.
The signer certificate SHA-256 is identical to version 11, so the APK can be
installed as an in-place upgrade. Complete ZIP integrity validation reports no
errors.

This is build and static-artifact evidence only. Tests were not run at the
product owner's request, and physical notification, device-approval, widget,
app-lock, accessibility, backup-restore, and offline-process drills remain
open.

## Remaining Physical Gate

The APK exists and is signed, but no physical Android claim is made yet.
Install the artifact on the oldest supported Android 7/API 24 device available
and a current Android device, then complete the notification, snooze, offline,
app-lock, widget, TalkBack, largest-text, sound, haptic, backup-restore, and
deep-link checks in `docs/ACCEPTANCE.md` and `docs/PLATFORM_SUPPORT.md`.
