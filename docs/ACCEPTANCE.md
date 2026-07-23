# Controlled-Beta Acceptance

Status recorded on 2026-07-23.

## Implemented And Locally Verified

- [x] Task creation, editing, scheduling, recurrence, completion, Undo, search,
  priority/time lanes, week/month calendar, inbox, and history
- [x] One-off, routine, medication, dose confirmation, subtasks, and
  independently configurable optional subtask reminders
- [x] Multiple reminder stages and per-task snooze presets
- [x] Templates browse/copy/create/edit/delete
- [x] Focus mode and reminder deep links
- [x] Optional Check-In mood/reflection/search/trends/reminder setting
- [x] Continuous searchable Brain Dump and Yjs merge tests
- [x] SQLite native persistence and IndexedDB web persistence
- [x] Encrypted field outbox, idempotent RPC contract, private Broadcast, and
  incremental durable reconciliation integration
- [x] Recovery-key confirmation and recovery-code restore flow
- [x] Short-lived encrypted new-device approval by an existing trusted device,
  including explicit approve/reject and one-time target-bound key handoff
- [x] Trusted reminder-device controls and reconnect-time revocation cleanup
- [x] Local readable/encrypted exports, validated backup restore/merge, and
  one-hour deletion UI/backend worker
- [x] Light/dark/system themes, reduced motion, sounds, haptics, and app lock
- [x] iOS widget sources for today's tasks and the next actual enabled task or
  subtask reminder trigger
- [x] Installable PWA manifest, icons, static routes, and offline app shell
- [x] Explicit active-tab-only web reminder fallback
- [x] Keyboard roles/labels, visible focus, semantic state, reduced motion, and
  AA light/dark theme token contrast

Local evidence:

- strict TypeScript passes for all packages
- 61 automated tests pass: 28 domain, 6 cryptography, and 27 application tests
- static security-contract tests prevent direct account-key writes and
  proofless privileged RPC signatures
- both migrations apply from scratch to local Supabase/PostgreSQL and
  `db lint --local --level warning` reports no schema errors or warnings
- `pnpm verify:supabase` passes 31 authenticated integration checks covering
  cross-account RLS, direct-write denial, invalid proofs, encrypted
  trusted-device approval and claim, envelope erasure, request rejection,
  revocation, anonymous denial, and deletion read-only enforcement
- local Supabase sends the six-digit code expected by both the first-time and
  returning-user passwordless sign-in forms
- a two-origin browser walkthrough completed recovery setup, requested and
  approved a target-bound device handoff, unlocked the second client, removed
  the claimed code from the approving UI, and kept secondary reminders off
- a task created on the newly approved browser appeared on the original browser
  through encrypted realtime synchronization without a reload
- Expo Doctor passes 19/20 checks after native project generation; the only
  remaining check is host tooling because CocoaPods/full Xcode are not
  installed on this machine
- clean Expo Prebuild succeeds without configuration warnings
- generated Android configuration disables application backup and removes
  recording, background-audio, broad-storage, and overlay permissions
- generated iOS configuration has no microphone or background-audio
  declarations, uses the explicit widget bundle ID, and produces an opaque
  1024-pixel App Store icon
- iOS and Android Hermes bundle exports succeed
- production web export succeeds
- Workbox precaches 15 URLs
- production dependency audit reports no known vulnerabilities
- browser walkthrough passed task, Undo/fade, checkbox-only reopening, separate
  medication dose confirmation, editor, Check-In, Brain Dump, templates,
  navigation, accessibility-tree, and focus-indicator checks
- browser backup drill rejected an invalid file, restored a real AES-GCM
  backup through the file chooser, and verified the imported task and settings
  persisted after reload
- browser subtask-reminder drill verified independent timing choices,
  persistence after reopening, and explicit checked/selected ARIA states

## Requires Connected Backend Validation

- [ ] Google, Apple, GitHub, and email OTP against configured hosted providers
- [ ] Apply and lint the proven migrations against the selected EU project
- [ ] Repeat cross-account RLS, unauthorized RPC, and trusted-device approval
  checks against the deployed EU project
- [ ] Two-client encrypted sync latency and missed-broadcast recovery
- [ ] Device reminder ownership and revocation across live sessions
- [ ] Scheduled deletion finalizer after the one-hour window
- [ ] Export recovery drill using a separate clean device

## Requires Physical Device Validation

- [ ] iOS and Android local notification scheduling/action/snooze
- [ ] Offline reminders after process termination
- [ ] Biometric/device-PIN app lock
- [ ] Sound and haptic preference behavior
- [ ] iOS widget rendering and deep links
- [ ] Screen-reader and dynamic-type walkthroughs

## Mandatory Production Gate

- [ ] Independent security review is complete
- [ ] Every critical or high security finding is resolved
- [ ] Legal review covers medication wording, privacy, retention, and regional
  commitments
- [ ] App Store/Play signing, privacy declarations, and release artifacts are
  complete

The repository is implementation-complete for local controlled-beta
preparation, but it is not production-ready until every unchecked gate above
has evidence.
