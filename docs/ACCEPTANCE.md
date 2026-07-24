# Controlled-Beta Acceptance

Status recorded on 2026-07-24.

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
- [x] iOS widget timelines for today's tasks and the next actual enabled task or
  subtask reminder trigger, including midnight and fired-reminder transitions
- [x] Installable PWA manifest, icons, static routes, signed-in offline reload,
  local mutation persistence, and reconnecting outbox
- [x] Explicit active-tab-only web reminder fallback
- [x] Keyboard roles/labels, visible focus, semantic state, reduced motion, and
  AA light/dark theme token contrast

Local evidence:

- strict TypeScript passes for all packages
- 99 automated tests pass: 39 domain, 6 cryptography, and 54 application tests
- domain tests cover grace-window exhaustion, recurring task-type eligibility,
  multiple selected weekdays, multi-week intervals, monthly short-month
  clamping and anchor recovery, due-time shifting, invalid recurrence rules,
  and stale-schedule catch-up without backlog creation
- task inbox tests cover undated, today, future, grace-window, overdue, and
  completed placement plus searchability
- static security-contract tests prevent direct account-key writes and
  proofless privileged RPC signatures
- all three migrations apply from scratch to local Supabase/PostgreSQL and
  `db lint --local --level warning` reports no schema errors or warnings
- `pnpm verify:supabase` passes 31 authenticated database checks covering
  cross-account RLS, direct-write denial, invalid proofs, encrypted
  trusted-device approval and claim, envelope erasure, request rejection,
  revocation, anonymous denial, and deletion read-only enforcement
- the same command passes 12 live Edge Function checks covering scheduler
  authorization, POST-only execution, the one-hour deadline, due processing,
  and cascading removal of the Auth user, sessions, device keys, and encrypted
  records
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
- native notification-plan tests cover task/subtask payloads, Focus and snooze
  actions, killed-app-compatible response delivery, completion suppression,
  Check-In routing, and categorized repeat snoozes
- completing or reopening a subtask now replaces that task's scheduled
  notifications so finished steps do not leave stale alerts
- iOS widget timeline tests prove automatic local-midnight task rollover and
  advancement after each reminder trigger without reopening the app
- account deletion and device revocation clear scheduled and displayed native
  notifications; iOS also replaces both widget timelines with content-free
  states before local database deletion
- normal and Supabase-driven sign-out clear scheduled/displayed native
  notifications and replace iOS widget timelines with content-free states
  without deleting the returning user's local repositories
- per-user reminder authorization is restored from a content-free local cache
  during offline startup; unresolved ownership does not cancel existing native
  schedules, and fresh server device state always overrides the cache
- task and Check-In schedulers guard unresolved reminder ownership, web
  active-tab reminders honor primary/secondary device settings, and revocation
  or final account deletion removes the authorization cache
- a task-load race test contract verifies that reconciliation reads the latest
  authorization after asynchronous repository loading
- production web export succeeds
- production web artifact verification passes 12 installability and offline
  cache checks
- Workbox precaches 21 URLs, including every font weight loaded before render
  and both optional interaction sounds
- production Lighthouse scores 100% for accessibility and 100% for best
  practices on the configured sign-in screen
- production dependency audit reports no known vulnerabilities
- browser walkthrough passed task, Undo/fade, checkbox-only reopening, separate
  medication dose confirmation, editor, Check-In, Brain Dump, templates,
  navigation, accessibility-tree, and focus-indicator checks
- browser backup drill rejected an invalid file, restored a real AES-GCM
  backup through the file chooser, and verified the imported task and settings
  persisted after reload
- browser subtask-reminder drill verified independent timing choices,
  persistence after reopening, and explicit checked/selected ARIA states
- browser recurrence drill persisted a two-week Monday/Thursday/Saturday
  routine, kept an undated task searchable but out of dated lanes, classified a
  stale routine inside its three-day grace window, and advanced its completion
  directly to the next future occurrence without creating a backlog
- browser deadline drill created a date-only task, displayed its due date in
  the inbox, reopened it with no invented due time or reminder, and rejected an
  impossible calendar date without overwriting the saved task
- `pnpm verify:yjs-runtime` renders the development web app twice and confirms
  Expo server reloads do not evaluate a second Yjs runtime; Brain Dump merge
  tests continue to exercise real CRDT edits and concurrent updates
- a production PWA drill signed in, persisted an encrypted task, stopped both
  the app server and Supabase, reloaded successfully, created another task
  offline, reloaded with the outbox still queued, restored Supabase, and
  reconciled automatically; both cloud rows remained ciphertext-only

## Requires Connected Backend Validation

- [ ] Google, Apple, GitHub, and email OTP against configured hosted providers
- [ ] Apply and lint the proven migrations against the selected EU project
- [ ] Repeat cross-account RLS, unauthorized RPC, and trusted-device approval
  checks against the deployed EU project
- [ ] Two-client encrypted sync latency and missed-broadcast recovery
- [ ] Device reminder ownership and revocation across live sessions
- [ ] Repeat the scheduled deletion finalizer drill against the hosted project
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
