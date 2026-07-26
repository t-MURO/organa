# Organa iOS Simulator Build Evidence

Status recorded on 2026-07-26.

This record proves that the generated iOS application and widget extension
compile together as a standalone simulator artifact. It does not replace
physical-device, Apple signing, App Group provisioning, notification,
VoiceOver, dynamic-type, export-compliance, TestFlight, or App Store evidence.

## Build Identity

```text
EAS project: ae92cff5-050e-4972-808d-a393be8d67e3
EAS build: d8daa354-fd72-45a3-a8ea-18009cd0e675
Profile: preview-simulator
Platform: iOS Simulator
Source commit: ffdfd3012d33e0f04c965307f871aed0c8d5a518
App version: 0.1.0
Build version: 1
Created: 2026-07-26T13:33:37.397Z
Completed: 2026-07-26T13:39:23.297Z
Result: FINISHED
```

Dashboard record:

<https://expo.dev/accounts/t-muro/projects/organa/builds/d8daa354-fd72-45a3-a8ea-18009cd0e675>

The preview EAS environment passed Organa's three-value release-client
preflight before the build. Values were not printed. EAS bound the job to the
exact clean source commit above and marked it as an iOS Simulator build.

## Artifact Verification

The downloaded simulator artifact is ignored by Git at:

```text
artifacts/organa-ios-simulator-0.1.0-1-ffdfd30.tar.gz
```

```text
Bytes: 29,034,446
SHA-256: 550c0a3ed1a42844a8c194bb3ae84c4e39f423a3f1c3894990c81a65f19b00d1
Archive: valid gzip/tar
Deep code-signature verification: passed
```

The archive contains:

- `Organa.app`
- `Organa.app/PlugIns/ExpoWidgetsTarget.appex`
- compiled Hermes/native frameworks, privacy manifests, assets, and the
  bundled application code

Native metadata verification:

| Target | Bundle identifier | Minimum iOS | Architectures |
| --- | --- | --- | --- |
| Organa app | `app.organa.mobile` | 16.4 | `x86_64`, `arm64` |
| Widget extension | `app.organa.mobile.widgets` | 16.4 | `x86_64`, `arm64` |

The generated app and widget entitlement sources both contain
`group.app.organa.mobile`, and the generated Xcode project points each target
to its corresponding entitlement file. The simulator artifact's ad-hoc
signatures contain empty entitlement dictionaries, so this build cannot prove
real App Group provisioning or shared widget storage. Those remain
physical-device signing and interaction gates.

## Explicit Limits

- This Mac has Apple Command Line Tools but not full Xcode or `simctl`, so the
  artifact could not be installed or launched locally.
- Simulator compilation does not prove local-notification delivery, actions,
  snooze, offline behavior after process termination, biometric unlock,
  sound/haptics, widget resize/rollover/deep links, or accessibility behavior.
- EAS reported that `ITSAppUsesNonExemptEncryption` is not declared. Organa
  implements AES-256-GCM, so the source intentionally does not guess this
  legal/export-compliance answer. Apple export-compliance review remains
  mandatory before TestFlight or App Store submission.
- No tests were added, changed, or run for this milestone.

## Supporting References

- [Expo: Build for iOS Simulators](https://docs.expo.dev/build-reference/simulators/)
- [Apple: Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)
- [Apple: Complying with encryption export regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)
