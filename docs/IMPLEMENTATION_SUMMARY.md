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
- Per-subtask before/due/after reminder choices with explicit quiet steps
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
- Local readable exports and encrypted backups with an in-app restore/merge
  workflow
- One-hour cancellable account-deletion flow
- iOS Today Tasks and Next Reminder widgets; Next Reminder uses the earliest
  actual enabled task or subtask reminder trigger, including configured
  offsets, and both widgets receive future timeline transitions
- Installable PWA with a Workbox offline application shell, cached render
  fonts, durable local mutations, and automatic reconnecting outbox

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
- Completing or reopening a subtask reconciles its task's local notification
  schedule immediately, preventing completed-step reminders from remaining.
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
- New devices can alternatively request a 15-minute approval from an existing
  trusted device. The approving device creates a target-bound AES-GCM envelope
  and displays a one-time code that never reaches Supabase.
- Encrypted backup imports validate every nested record and Brain Dump CRDT
  payload before writing, reject files over 20 MB, preserve newer local
  records, and re-encrypt restored data for the current account.
- Trusted devices can be viewed and revoked.
- First account-key/device enrollment is atomic, and account-key rows cannot be
  replaced directly by authenticated clients.
- New devices require either a one-time trusted-device approval or a one-way
  proof derived from the recovery key. Revoked devices require recovery.
- Encrypted writes and privileged device/account actions require a hidden
  per-device proof secret.
- One primary reminder device is supported; notifications on additional
  devices require explicit enablement.
- Revoked devices clear local Organa data and sign out when revocation is
  observed.
- Revocation and final account deletion remove the local device proof secret
  and clear all known SQLite/IndexedDB stores before database removal. Native
  cleanup also removes scheduled and displayed notifications, while iOS clears
  both widget timelines.
- The migration enables RLS, validates trusted-device writes, retains encrypted
  record history temporarily, and restricts private Realtime topics by user.
- The client contains no product analytics, advertising identifiers, session
  recording, or automatic crash telemetry.

Known security work that remains mandatory before production:

- Independent cryptographic and application security review
- Resolution of every critical or high review finding
- Hosted cross-account RLS and RPC abuse testing
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
- 72 automated tests pass:
  - 28 domain tests
  - 6 cryptography tests
  - 38 application integration tests
- All three migrations apply cleanly from scratch to local
  Supabase/PostgreSQL.
- Local Supabase database lint reports no errors or warnings.
- `pnpm verify:supabase` passes 31 authenticated database checks for RLS,
  proof-gated approval, claim, rejection, revocation, and deletion read-only
  behavior.
- The same command passes 12 live account-deletion Edge Function checks,
  including scheduler authorization and cascading removal of the Auth user,
  sessions, keys, devices, encrypted records, and deletion request.
- iOS Hermes export succeeds.
- Android Hermes export succeeds.
- Production web export succeeds.
- Production web artifact verification passes 12 installability and offline
  cache checks.
- Eight static web routes are generated.
- Workbox precaches 21 URLs, including the render-critical Manrope fonts and
  optional interaction sounds.
- Production Lighthouse scores 100% for accessibility and 100% for best
  practices on the configured sign-in screen.
- Production dependency audit reports no known vulnerabilities.
- `git diff --check` passes.
- A browser recovery drill selected a real AES-GCM backup through the web file
  picker, rejected an invalid backup, restored a task and theme, and verified
  both persisted after reload.
- A browser subtask-reminder drill created two steps with different timings,
  reopened the task to verify persistence, and confirmed explicit ARIA checked
  and selected states.
- A two-origin browser walkthrough completed email-code sign-in, first-device
  recovery setup, target-bound approval, second-device local decryption and
  claim, quiet secondary enrollment, and post-claim code removal.
- A task created on the newly approved browser appeared on the original browser
  through encrypted realtime synchronization without a reload.
- A production PWA remained signed in with its cached task after both the app
  server and Supabase stopped, persisted a new offline task and outbox across
  another reload, then reconciled automatically when Supabase returned. The
  resulting cloud rows contained no task-title plaintext.
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
- `4963b1b` - reconcile remote reminder changes and add this summary
- `694c8d6` - erase local device data reliably
- `8a7b71d` - restore encrypted backups
- `fec1e70` - configure reminders per subtask
- `d707d0c` - show the actual next reminder in the widget
- `45aaaa7` - approve new trusted devices
- `f7adffe` - verify account deletion finalization
- `955adf5` - keep the signed-in PWA usable offline
- `950f1a0` - keep native reminders and widgets current

## Latest Security Hardening

- Recovery-authorized device enrollment and per-device write proofs
- One-time encrypted trusted-device approval with 15-minute expiry,
  target-binding, explicit rejection, and envelope erasure after claim
- Atomic account-key/first-device enrollment
- Server-enforced deletion read-only state
- Resilient local-data and device-secret erasure on revocation/deletion
- Validated, size-limited encrypted backup import with newest-record merge
- Security-contract regression tests and updated security documentation

## Trusted-Device Approval Milestone

This milestone includes:

- A target-bound AES-256-GCM content-key handoff and checked `ODA1` one-time
  approval code in `packages/crypto`
- A 15-minute Supabase approval request, approval, rejection, and claim flow
- Proof-gated RPCs, RLS isolation, envelope erasure after claim, and deletion
  read-only enforcement
- A pending-device screen that can request approval, poll for status, and
  unlock locally with the one-time code
- Trusted-device account controls that can approve or reject incoming requests
- Reproducible local Supabase verification covering 31 authenticated database
  checks and 12 live account-deletion Edge Function checks
- A web authentication-storage guard that prevents configured Expo server
  rendering from treating an incomplete `localStorage` placeholder as storage
- Checked-in local confirmation and returning-user email templates that send
  the six-digit code expected by Organa
- Web-storage and email-template regression tests; the complete automated suite
  currently passes 72 tests

Local Supabase has been reset successfully from all three migrations, database
lint reports no schema errors, and all 43 live backend checks pass.
Configured production web export and both native Hermes exports succeed. The
combined two-device approval UI and encrypted realtime task propagation were
also exercised in separate browser origins against the local backend.

## Account-Deletion Finalization Milestone

This milestone includes:

- A scheduler-authorized, POST-only Edge Function for final account deletion
- A narrow database privilege grant that lets the service-role finalizer read
  due deletion requests without widening authenticated-client access
- A reproducible local verifier that creates a real Auth user, content key,
  trusted device, encrypted record, session, and deletion request
- Verification that deletion remains cancellable for one hour and that the
  finalizer removes the Auth user, active session, account key, trusted device,
  encrypted record, and deletion request after the deadline
- Twelve live Edge Function checks run as part of `pnpm verify:supabase`

## Offline PWA Milestone

This milestone includes:

- Immediate restoration of cached per-user account-deletion state so a signed-in
  user is not blocked while Supabase is unreachable
- A revisioned Workbox precache containing the application shell, install
  assets, four render-critical Manrope font files, and optional interaction
  sounds
- A web-build verifier covering document metadata, the manifest, install icons,
  JavaScript bundles, fonts, sounds, and service-worker precache entries
- A production browser drill in which a signed-in app reloaded after both the
  static server and Supabase stopped, retained its encrypted local data, queued
  a new task offline, preserved that outbox across another reload, and synced
  automatically when Supabase returned
- Database inspection confirming that the synced cloud rows did not contain the
  plaintext titles used during the offline drill
- Lighthouse accessibility and best-practices scores of 100% on the configured
  production sign-in screen

## Native Reminder And Widget Reliability Milestone

This milestone includes:

- Pure, platform-independent construction and tests for native task and subtask
  notification payloads, Focus and snooze actions, category identifiers, and
  response routing
- Foreground-compatible snooze actions so Expo can deliver the action response
  even when the application process had been terminated
- Repeat snoozes that retain task or subtask context, the original notification
  category, and the Focus action
- Immediate notification reconciliation when a subtask is completed or
  reopened, removing stale completed-step alerts
- iOS Today and Next Reminder timelines that advance at local midnight and at
  each known reminder trigger without requiring the app to reopen
- Native private-state cleanup that removes scheduled and displayed
  notifications after revocation or deletion, plus content-free iOS widget
  timelines before local database removal
- Successful iOS and Android Hermes exports after the platform-specific changes

## Remaining Acceptance Gates

Connected Supabase project:

- Configure and exercise hosted Google, Apple, GitHub, and email-code
  providers.
- Apply and lint the proven migrations against the selected EU Supabase
  project.
- Repeat cross-account RLS, unauthorized RPC, and trusted-device approval
  tests against the deployed project.
- Measure two-client encrypted sync and missed-broadcast recovery.
- Validate live reminder-device ownership and revocation.
- Repeat the scheduled deletion finalizer drill against the hosted project.
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
