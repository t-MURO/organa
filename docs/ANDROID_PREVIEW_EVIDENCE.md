# Android Preview Build Evidence

Status recorded on 2026-07-26.

## Successful Artifact

- EAS project: `@t-muro/organa`
- Build ID: `40f3cb8e-f3f2-49d3-828d-65b0e15e3d74`
- Source commit: `ca648c4e59254834d914053fbaa2a26ddcad0abd`
- Profile and distribution: `preview`, internal APK
- App version and build: `0.1.0` (`2`)
- Terminal status: `FINISHED`
- Cloud build duration: 833 seconds
- Artifact size: 111,768,030 bytes
- Artifact SHA-256:
  `ffcb09f1f3efc3b6a824c0e3fc651e8d3069f48585e2333ddea81c169bc4e6e2`
- EAS record:
  <https://expo.dev/accounts/t-muro/projects/organa/builds/40f3cb8e-f3f2-49d3-828d-65b0e15e3d74>

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

## Sync Recovery Purpose

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
- `pnpm verify:platform` passes 23 source/generated checks.
- `pnpm build:native` exports both iOS and Android Hermes bundles.
- `pnpm build:web` passes 28 artifact checks with 23 precache URLs.
- `pnpm audit --prod --json` reports zero findings at every severity.
- No tests were added, changed, or run.

## Remaining Physical Gate

The APK exists and is signed, but no physical Android claim is made yet.
Install the artifact on the oldest supported Android 7/API 24 device available
and a current Android device, then complete the notification, snooze, offline,
app-lock, widget, TalkBack, largest-text, sound, haptic, backup-restore, and
deep-link checks in `docs/ACCEPTANCE.md` and `docs/PLATFORM_SUPPORT.md`.
