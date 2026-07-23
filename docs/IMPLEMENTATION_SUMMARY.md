# Organa Implementation Summary

Status recorded on 2026-07-23.

## Product Implemented

Organa is implemented as a shared Expo application for iOS, Android, responsive
web, and installable PWA. The interface follows the calm, minimal,
organization-focused direction in `REQUIREMENTS.md`.

Implemented user-facing areas:

- One-off, repeating routine, and medication tasks
- Optional due dates, scheduled dates and times, priorities, duration,
  recurrence, reminders, subtasks, snooze presets, and grace-day settings
- Checkbox-only completion, visible completed state, delayed fade, and Undo
- Separate optional medication dose confirmation
- Priority and scheduled-time lanes
- Week calendar with month toggle
- Upcoming, overdue, completed, and repeating-task history
- Official templates and private editable user templates
- Focus mode with optional timer, break/reset, and reminder deep links
- Optional daily Check-In with mood 1-5, feeling label, reflection, search,
  evening reminder, and 7/30-day trends
- Continuous bullet-only Brain Dump with search and Yjs conflict-free updates
- Light, dark, and system themes
- Optional creation/completion sounds and completion haptics
- Optional biometric/device-authentication app lock
- Local readable exports and encrypted restorable backups
- One-hour cancellable account-deletion flow
- iOS Today Tasks and Next Reminder widgets
- Installable PWA with a Workbox offline application shell

## Persistence And Synchronization

- Native data is stored locally with SQLite.
- Web/PWA data is stored locally with IndexedDB.
- Core features read and write local data before network synchronization.
- Offline mutations are retained in a persistent outbox.
- User fields are encrypted on the client with AES-256-GCM before upload.
- Structured records use encrypted field-level patches.
- Supabase PostgreSQL is the durable encrypted authority.
- Private Realtime Broadcast events contain opaque change signals.
- Missed broadcasts are recovered with periodic, subscription-time, and
  foreground durable reconciliation.
- Mutation IDs make outbox retries idempotent.
- Different-field changes merge independently.
- Brain Dump edits use encrypted Yjs updates.
- Task changes received from another client now reconcile the local
  notification schedule, including cancellation after remote deletion.
- Synced Check-In reminder settings follow the current device's reminder
  ownership.

## Authentication And Security

- Supabase Auth adapters support Google, Apple, GitHub, and email verification
  codes.
- Production use requires an account.
- Local preview is exposed only in development when Supabase is not configured.
- Native sessions and content keys use platform secure storage.
- Web content keys are wrapped with a non-extractable Web Crypto key stored in
  IndexedDB.
- Onboarding generates a recovery code and requires storage confirmation.
- New devices can restore the content key locally with the recovery code.
- Trusted devices can be viewed and revoked.
- One primary reminder device is supported; notifications on additional
  devices require explicit enablement.
- Revoked devices clear local Organa data and sign out when revocation is
  observed.
- The migration enables RLS, validates trusted-device writes, retains encrypted
  record history temporarily, and restricts private Realtime topics by user.
- The client contains no product analytics, advertising identifiers, session
  recording, or automatic crash telemetry.

Known security work that remains mandatory before production:

- Independent cryptographic and application security review
- Resolution of every critical or high review finding
- Connected cross-account RLS and RPC abuse testing
- Physical-device secure-storage, biometric, notification, and backup testing
- Final legal, privacy, retention, and medication-language review

## Native Release Hardening

- Added complete Organa app, adaptive, monochrome, splash, and notification
  branding.
- Verified the generated 1024-pixel iOS App Store icon is opaque RGB.
- Added explicit iOS build number and Android version code.
- Disabled Android application backup for sensitive local state.
- Removed recording, microphone, background-audio, media-service,
  broad-storage, and overlay permissions.
- Configured gentle-reminder notification channels and icons.
- Added `expo-system-ui` for system light/dark preference support.
- Added an explicit iOS widget extension bundle identifier.
- Clean Expo Prebuild completes without configuration warnings.
- Generated iOS configuration contains no microphone or background-audio
  declarations.

## Verification Evidence

Latest verified repository checks:

- Strict TypeScript passes for all three workspace packages.
- 40 automated tests pass:
  - 27 domain tests
  - 3 cryptography tests
  - 10 application integration tests
- iOS Hermes export succeeds.
- Android Hermes export succeeds.
- Production web export succeeds.
- Eight static web routes are generated.
- Workbox precaches 15 URLs.
- Production dependency audit reports no known vulnerabilities.
- `git diff --check` passes.
- Expo Doctor passes 19 of 20 checks with generated native projects. The only
  failure is host tooling because CocoaPods/full Xcode are not installed on
  this machine.

The machine can generate native projects and JavaScript/Hermes bundles, but it
cannot compile or sign App Store/Play Store binaries because full Xcode,
CocoaPods, and the Android SDK are not installed.

## Commits

Major implementation commits:

- `bf61eb3` - initialize Organa task planning app
- `0173ba8` - add reflective tools and full task editor
- `0ca0009` - add calendar planning and recurring history
- `e4228a4` - add templates, Focus, and local reminders
- `191a3e5` - complete controlled-beta foundation
- `030cdd8` - align completion and recovery flows
- `f83f73a` - recover missed realtime changes
- `2652a15` - restore native Brain Dump bundles
- `a9ad329` - harden native release configuration

## Current Uncommitted Work

- Remote task synchronization now reschedules or cancels local notifications.
- Remote Check-In reminder settings now use current reminder-device ownership.
- Regression tests cover remote task notification reconciliation.
- This implementation summary has been added.

## Remaining Acceptance Gates

Connected Supabase project:

- Configure and exercise Google, Apple, GitHub, and email-code providers.
- Apply and lint the migration against Docker or an EU Supabase project.
- Run cross-account RLS and unauthorized RPC tests.
- Measure two-client encrypted sync and missed-broadcast recovery.
- Validate live reminder-device ownership and revocation.
- Execute the scheduled deletion finalizer after the one-hour window.
- Restore an encrypted export on a separate clean client.

Physical devices:

- Validate iOS and Android notification scheduling, actions, and snooze.
- Validate reminders after process termination and while offline.
- Validate biometric/device-PIN app lock.
- Validate sound and haptic preferences.
- Validate iOS widgets and deep links.
- Complete VoiceOver/TalkBack and dynamic-type walkthroughs.

Production:

- Complete independent security review.
- Resolve all critical and high security findings.
- Complete legal and privacy review.
- Produce signing identities, store privacy declarations, and release
  artifacts.

The source implementation is suitable for local controlled-beta preparation,
but the unchecked connected, physical-device, security, legal, and store gates
must have direct evidence before production launch.
