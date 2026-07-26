# Android Preview Build Evidence

Status recorded on 2026-07-26.

## Successful Artifact

- EAS project: `@t-muro/organa`
- Build ID: `812d5e0c-5e26-40a5-9652-a95332fd23c3`
- Source commit: `4faf6e6e2f4369a1cb95adb19146879b1a8d1ede`
- Profile and distribution: `preview`, internal APK
- App version and build: `0.1.0` (`1`)
- Terminal status: `FINISHED`
- Cloud build duration: 1,049 seconds
- Artifact size: 111,653,938 bytes
- Artifact SHA-256:
  `b8e7e613be87200669cb864635ca4557f573ad862e1f2b6ca19fa36667aa4081`
- EAS record:
  <https://expo.dev/accounts/t-muro/projects/organa/builds/812d5e0c-5e26-40a5-9652-a95332fd23c3>

The downloaded APK passes complete ZIP integrity validation. Android's
`apksig` verifier `9.3.1` reports one signer, a valid APK Signature Scheme v2
signature, and an overall verified result. The checksum and signature result
apply only to the artifact identified above.

The matching EAS `preview` client environment passed Organa's three-field,
value-redacting release preflight before the build. The `production`
environment independently passed the same preflight. This evidence records
only validation status; no environment value or signing credential belongs in
the repository.

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
plugin and generated output. The successful retry passed the formerly failing
duplicate-class task and completed release assembly and signing.

## Local Verification

- `pnpm typecheck` passes.
- `pnpm verify:platform` passes 20 source/generated checks.
- `pnpm build:native` exports both iOS and Android Hermes bundles.
- No tests were added, changed, or run.

## Remaining Physical Gate

The APK exists and is signed, but no physical Android claim is made yet.
Install the artifact on the oldest supported Android 7/API 24 device available
and a current Android device, then complete the notification, snooze, offline,
app-lock, widget, TalkBack, largest-text, sound, haptic, backup-restore, and
deep-link checks in `docs/ACCEPTANCE.md` and `docs/PLATFORM_SUPPORT.md`.
