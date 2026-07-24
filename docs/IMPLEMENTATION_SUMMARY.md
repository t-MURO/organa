# Organa Implementation Summary

Status recorded on 2026-07-24.

This is the structured pause checkpoint requested after the implementation
work. The implementation is complete through the task-type and
subtask-reminder consistency milestone described below.
`docs/REQUIREMENTS_TRACEABILITY.md` maps every controlled-beta acceptance
criterion to direct evidence and its remaining gate.

## Current Checkpoint

Committed and verified milestones:

- Controlled-beta product foundation across iOS, Android, web, and PWA
- Encrypted local-first persistence, realtime synchronization, and recovery
- Trusted-device approval, revocation, and account-deletion finalization
- Offline PWA restoration and durable outbox behavior
- Native reminder payloads, actions, reconciliation, and widget timelines
- Recurrence, grace-day, inbox, and undated-task semantics
- Independent date-only deadlines
- Stable single-runtime Yjs loading for Brain Dump
- Explicit controlled-beta OS and browser support boundaries
- Deterministic local performance checks against a 2,000-task dataset
- Fail-closed encrypted-backup domain validation
- A 20-item controlled-beta traceability matrix that separates locally
  verified behavior from connected-provider, physical-device, and external
  review gates

Latest checkpoint commits:

- `eee913d` rejects invalid decrypted backup domain records before restore.
- `2c669ce` adds deterministic local task-performance verification.
- `32bf4e9` pins and verifies the controlled-beta platform boundaries.
- `632c799` refreshes this implementation checkpoint.
- `9fe7c0e` documents requirement traceability and the remaining launch gates.
- `b12bc7a` fixes reminder-bearing template instantiation.
- `9bd7d24` delivers privacy-minimized standards-based Web Push.

Latest verified task-type work:

- Enforces that One-off tasks and templates cannot carry recurrence.
- Clears and hides incompatible recurrence controls in both editors.
- Rejects contradictory One-off recurrence during encrypted-backup restore.
- Materializes legacy inherited subtask reminders when per-step editing is
  enabled, keeping visible chips aligned with the actual saved schedule.
- A live web walkthrough confirms the One-off-to-Routine-to-One-off transition
  in both task and template editors. A saved task reopens as One-off with no
  recurrence control.
- Passes strict TypeScript, 130 automated tests, the 2,000-task performance
  verifier, iOS and Android Hermes exports, the production PWA export, the
  production dependency audit, and `git diff --check`.

## Platform Compatibility Milestone

- Pins the iOS deployment target to 16.4.
- Pins Android minimum API 24 and compile/target API 36.
- Adds a release platform and capability contract covering native apps,
  browsers, reminders, biometrics, haptics, and widgets.
- Explicitly limits the controlled-beta widget claim to iOS/iPadOS because the
  selected Expo widget module is iOS-only.
- Adds a deterministic platform verifier covering source/generated build
  targets, sensitive Android manifest boundaries, browser policy, and the
  widget support claim.
- The verifier passes all 19 checks.
- Strict TypeScript and all 110 automated tests pass.
- iOS and Android Hermes exports and the configured production PWA export
  succeed from the regenerated native source state.
- Expo Doctor passes 19 of 20 checks; only the previously documented local
  CocoaPods/full-Xcode tooling check remains unavailable on this host.

## Local Performance Milestone

- Extracts the exact task-list upsert/removal path into a small pure model used
  by the live task provider.
- Replaces the previous two-pass task replacement with a single lookup and
  copy while preserving task order and immediate local rendering.
- Adds repeatable median timing checks for Quick Add, recurring completion,
  Today planning, and search against a 2,000-task personal dataset.
- Each measured local operation has the requirements-level 100 ms budget.
- At this milestone, the full suite passed 116 tests: 41 domain, 6
  cryptography, and 69 application tests.
- This verifier covers synchronous local interaction work only; signed
  release-device timing and hosted realtime latency remain separate gates.

## Backup Integrity Milestone

- Aligns encrypted-backup validation with the live task and Check-In domain
  instead of accepting structurally plausible but invalid records.
- Rejects zero-minute, duplicate, or out-of-order snooze presets.
- Rejects grace-day values outside 0–3 and grace days attached to one-off or
  non-recurring tasks.
- Rejects dose-confirmation settings on non-medication tasks.
- Rejects empty, padded, or multi-word Check-In feeling labels.
- Validation still completes before any local repository write, preserving the
  fail-closed restore boundary.
- Eighteen export/restore tests and the full 126-test suite pass.

## Task-Type Invariant Milestone

- Makes “One-off” an enforced non-recurring task kind in the shared domain.
- Rejects contradictory recurrence in task creation, user/official template
  creation, and decrypted backup restoration.
- Task and template editors clear recurrence when switched to One-off and hide
  repeat/grace controls that cannot apply.
- Template saves strip stale grace-day and dose-confirmation settings when the
  selected kind no longer supports them.
- Enabling per-step reminder configuration now makes inherited parent timings
  explicit for legacy subtasks, so the visible chips match the saved schedule
  while already explicit quiet steps remain quiet.
- A live web walkthrough confirms both editor transitions and a save/reopen
  cycle confirms One-off persistence without recurrence.
- The complete suite passes 130 tests: 43 domain, 6 cryptography, and 81
  application tests.

Latest committed implementation milestones:

- Cached per-user reminder-device authorization for offline startup
- A fail-closed but non-destructive unresolved authorization state
- Task and Check-In schedulers that preserve existing native schedules until
  reminder ownership is known
- Web active-tab reminders that honor primary/secondary device ownership
- Authorization-cache cleanup on revocation and final account deletion
- Seven focused tests covering authorization resolution, web cache behavior,
  scheduler guards, web ownership, and cleanup contracts
- Sign-out cleanup for scheduled and displayed notifications plus content-free
  iOS widget states
- Atomic demotion of previous primary reminder devices, which remain quiet
  until the user explicitly enables secondary reminders

Verification completed for the reminder-authorization work:

- Strict TypeScript passes.
- All 98 automated tests pass: 39 domain, 6 cryptography, and 53 application
  tests.
- The configured production web export succeeds.
- All 12 production web artifact checks pass.
- `git diff --check` passes.

Both iOS and Android Hermes exports pass with the reminder-authorization
changes.

## Web Push Milestone

This milestone extends browser reminders from the active-tab fallback to
standards-based Web Push while preserving a visible fallback for denied,
unsupported, and unconfigured browsers.

Implemented:

- A privacy-minimized browser scheduling plan for task, subtask, and daily
  Check-In reminders
- Browser Push subscription management using a configured public VAPID key
- Permission requests only after a user explicitly saves a reminder
- A per-user and per-device offline schedule queue that flushes after reconnect
- Version-aware queue acknowledgement so an in-flight RPC cannot erase a newer
  local schedule edit
- Validation that safely ignores malformed local queue data
- Proof-gated schedule replacement for trusted web reminder devices
- Service-worker Push handling with generic notification copy and safe
  task/Check-In deep links
- Web sign-out and account-deletion cleanup that removes the current
  server-side subscription while authenticated, clears pending schedules,
  closes visible notifications, and unsubscribes the browser Push endpoint
- New `web_push_subscriptions` and `web_push_reminders` tables with RLS,
  service-role-only access, strict input validation, and cascading cleanup
- Server enforcement of primary or explicitly enabled secondary reminder
  ownership
- A scheduler-authorized Edge Function that claims due reminders, sends
  encrypted Web Push payloads, advances daily Check-In reminders across local
  time zones, retries transient failures, and removes expired subscriptions
- Static integration tests, scheduling/DST tests, local database checks, a
  local Edge Function delivery verifier, production service-worker artifact
  checks, and a deterministic VAPID/protocol-encryption verifier

Privacy boundaries:

- Supabase receives operational delivery metadata only: the endpoint
  capability, Push encryption keys, user/device identifiers, opaque scope and
  reminder keys, safe route, fire time, and Check-In time-zone metadata.
- Task titles, task details, medication data, mood values, journal text, and
  Brain Dump content are not included in Push schedule rows or payloads.
- Notifications use the generic title `A gentle reminder` and body
  `Something in Organa is ready when you are.`
- The VAPID private key and scheduler secret remain server-only and are not
  stored in the repository.

Verification evidence:

- The full automated suite passes 108 tests: 39 domain, 6 cryptography, and 63
  application tests.
- Strict TypeScript passed.
- A configured production PWA export passed 16 artifact checks and precached
  22 URLs, including the Push handler.
- Both iOS and Android Hermes exports passed from the same source state.
- All five migrations applied from an empty database and database lint
  reported no findings.
- The local authenticated database verifier passed 54 checks.
- The live account-deletion verifier passed 13 checks, including cascading
  removal of Web Push state.
- The local Web Push Edge Function verifier passed 15 checks for authorization,
  one-shot completion, and daily Check-In advancement.
- The deterministic protocol verifier generated a real VAPID request and
  confirmed `aes128gcm` payload encryption without plaintext leakage.
- Browser UI verification confirmed the system-reminder capability copy and
  fallback behavior. The in-app browser did not grant notification permission,
  so no real browser subscription was created during that walkthrough.

The remaining Web Push gate is a real permission-granted, closed-app delivery
drill against the hosted function and scheduler in each supported release
browser. iOS and iPadOS require an installed Home Screen PWA.

## Reminder Template Instantiation Milestone

This milestone closes a reminder gap in the official and restored template
flows:

- Reusable templates remove absolute due dates, exact due timestamps, and
  recurrence occurrence/series identifiers when saved.
- Using a template always assigns the selected planning date.
- When a template has an enabled reminder and a scheduled time, instantiation
  derives a fresh exact due timestamp from that local day and time.
- Templates without reminders keep their planning time without inventing a
  deadline.
- The official Morning medication preset now creates a schedulable at-due
  reminder instead of carrying a reminder with no due timestamp.
- Six template tests cover reusable metadata, local reminder anchoring,
  no-reminder behavior, copy-before-edit, identity, and search.
- The full suite passes 110 tests, strict TypeScript passes, and configured
  web plus iOS/Android Hermes exports succeed.

## Sign-Out Privacy Milestone

This milestone prevents task, medication, and reminder content from remaining
visible on native system surfaces after authentication ends:

- The central authentication boundary clears private platform state after a
  successful local sign-out.
- Supabase-driven `SIGNED_OUT` events invoke the same cleanup, covering session
  termination outside the Account screen.
- Native cleanup cancels all scheduled notifications and dismisses displayed
  notifications.
- iOS replaces Today Tasks and Next Reminder widget timelines with
  content-free states.
- Widget and notification cleanup operations are failure-isolated with
  `Promise.allSettled`, so one platform API failure cannot prevent the others
  from running.
- Normal sign-out deliberately retains local repositories, the content key,
  and trusted-device identity for a later authenticated offline return.
  Revocation and final account deletion continue to perform full local erasure.
- The complete suite passes 99 tests: 39 domain, 6 cryptography, and 54
  application tests.
- Strict TypeScript, the configured production PWA with all 12 artifact
  checks, and iOS and Android Hermes exports pass.

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
- 130 automated tests pass:
  - 43 domain tests
  - 6 cryptography tests
  - 81 application integration tests
- All five migrations apply cleanly from scratch to local
  Supabase/PostgreSQL.
- Local Supabase database lint reports no errors or warnings.
- `pnpm verify:supabase` passes 54 authenticated database checks for RLS,
  proof-gated approval, claim, rejection, revocation, and deletion read-only
  behavior, including primary-device demotion and Web Push scheduling/removal.
- The same command passes 13 live account-deletion Edge Function checks,
  including scheduler authorization and cascading removal of the Auth user,
  sessions, keys, devices, encrypted records, deletion request, and Web Push
  state.
- The same command passes 15 live Web Push Edge Function checks for guarded
  dispatch, one-shot completion, and daily schedule advancement.
- The protocol verifier confirms VAPID authorization and encrypted
  `aes128gcm` payload construction.
- iOS Hermes export succeeds.
- Android Hermes export succeeds.
- Production web export succeeds.
- Production web artifact verification passes 16 installability, offline
  cache, and Web Push checks.
- Eight static web routes are generated.
- Workbox precaches 22 URLs, including the render-critical Manrope fonts,
  optional interaction sounds, and Push handler.
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
- `70ec45a` - complete recurring task semantics
- `ca0bdbb` - support date-only task deadlines
- `72ed273` - load Yjs once for Brain Dump
- `babc42d` - preserve reminder authorization offline
- `e9b6893` - clear private surfaces on sign out
- `263427d` - quiet demoted reminder devices
- `9bd7d24` - deliver private Web Push reminders
- `b12bc7a` - anchor reminder templates to use date
- `9fe7c0e` - trace controlled-beta requirements and remaining gates
- `632c799` - refresh the implementation checkpoint
- `32bf4e9` - pin controlled-beta platform support
- `2c669ce` - enforce local task performance
- `eee913d` - reject invalid backup domain records

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
- Reproducible local Supabase verification covering 37 authenticated database
  checks and 12 live account-deletion Edge Function checks
- A web authentication-storage guard that prevents configured Expo server
  rendering from treating an incomplete `localStorage` placeholder as storage
- Checked-in local confirmation and returning-user email templates that send
  the six-digit code expected by Organa
- Web-storage and email-template regression tests; the complete automated suite
  currently passes 99 tests

Local Supabase has been reset successfully from all four migrations, database
lint reports no schema errors, and all 49 live backend checks pass.
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

## Task Semantics Milestone

This milestone includes:

- A documented task domain model in `docs/DOMAIN_MODEL.md`, including recurrence,
  grace-day, parent/subtask, medication, history, and conflict-resolution rules
- Derived pressure-free task timing states for active, grace-window, overdue,
  and completed tasks without mutating their dates, reminders, or history
- Grace days limited to repeating routine and medication tasks, with zero to
  three local calendar days configured per task
- Upcoming inbox behavior that keeps every active task discoverable, including
  undated, today, future, and grace-window tasks
- Explicit overdue and completed filters backed by the same shared timing model
- Search support across undated and dated active tasks, with dated tasks sorted
  before undated tasks
- Weekly recurrence on multiple selected weekdays and configurable one-to-four
  week intervals
- Monthly recurrence anchored to the intended day of month, clamping in short
  months and returning to that anchor in a later month
- Recurring due times shifted by the same local-day distance as their planned
  dates
- Pressure-free recurrence catch-up that skips unmaterialized missed
  occurrences rather than creating a backlog after a late completion
- Recurrence validation and backup validation for intervals, weekdays, and
  monthly anchor days
- Intentional undated tasks from the detailed editor; Quick Add and templates
  continue to provide an explicit selected or current date
- Completion-transition naming separated from the task grace-day concept so
  the five-second checked/fade/Undo behavior remains unambiguous

Automated coverage added in this milestone includes:

- Grace-window and overdue timing-state tests
- Monthly short-month clamp, anchor recovery, and edited-anchor tests
- Multi-week and multiple-weekday recurrence tests
- Due-time shifting and stale-schedule catch-up tests
- Invalid recurrence rejection tests
- Inbox placement, search, overdue, completed, undated, and grace-window tests

The current automated suite passes 99 tests: 39 domain, 6 cryptography, and 54
application tests. At the task-semantics milestone, Strict TypeScript,
`git diff --check`, the configured production PWA build with all 12 artifact
checks, and iOS and Android Hermes exports also passed.

The browser walkthrough already verified:

- A weekly routine persisted a two-week interval and Monday, Thursday, and
  Saturday selections
- An undated task stayed in Upcoming, remained searchable, displayed
  `No date attached`, and did not appear in a dated calendar lane
- A daily task planned three days earlier remained in Upcoming during its
  configured three-day grace window and was not classified as overdue
- Completing that stale recurring task created the next future occurrence
  instead of materializing a missed-occurrence backlog
- Checkbox completion retained the visible checked state and Undo control
  during the delayed fade transition

## Date-Only Deadline Milestone

This milestone closes the distinction between an optional due date and an
optional exact due time:

- `dueDate` stores a local calendar deadline independently from `dueAt`
- Saving a due date without a due time no longer invents a `23:59` deadline
- Date-only deadlines remain active through the complete local due date
- Exact-time reminders are created only when both date and time are present
- A due date takes precedence over an earlier planning date for inbox overdue
  classification
- Recurring occurrences shift date-only deadlines by the same local calendar
  distance without adding a time
- Backup validation and restoration preserve date-only deadlines
- UI and domain boundaries reject impossible local calendar dates
- Legacy tasks containing only `dueAt` still reopen with their exact local date
  and time

The browser walkthrough created a date-only task, showed `Due Jul 25` in its
inbox metadata, reopened it with a blank due-time field and no at-due reminder,
and rejected `2026-02-30` without changing the saved task.

## Yjs Runtime Reliability Milestone

This milestone removes a duplicate-Yjs runtime hazard observed during repeated
Expo development server renders:

- Brain Dump CRDT helpers now load and cache Yjs only when CRDT work begins
  instead of evaluating it during every server render
- A deterministic `pnpm verify:yjs-runtime` command starts the real Expo web
  runtime, renders the app twice, and fails on Yjs's duplicate-import warning
- The verifier reproduced the warning before the fix and passes repeatedly
  afterward
- Existing Brain Dump tests still cover concurrent character-level merge,
  CRDT state validation, and persistence behavior
- Strict TypeScript, the configured production PWA export, and iOS and Android
  Hermes exports pass with the deferred runtime boundary

## Offline Reminder Authorization Work

This work fixes an offline-startup safety issue discovered during the reminder
ownership audit:

- Previously, a connected client could briefly have no loaded device list at
  startup and interpret that unknown state as `remindersAllowed=false`.
- The native task and Check-In schedulers could then cancel already scheduled
  local notifications before the server device record loaded.
- Web active-tab reminders did not check reminder-device ownership, so a
  secondary device could produce duplicate reminders.

The current working tree implements:

- A per-user reminder-authorization cache using SecureStore on native,
  `localStorage` on web, and an in-memory fallback for unsupported platforms
- A pure authorization resolver that distinguishes `allowed`, `disabled`, and
  unresolved states
- Fresh server device state as authoritative whenever it is available
- Cached authorization as the offline fallback for a returning user
- No scheduling or cancellation while authorization is unresolved, preserving
  existing native schedules
- Ownership enforcement for task reminders, the daily Check-In reminder, and
  web active-tab notices
- Removal of the cached authorization during device revocation and final
  account deletion
- User-ID scoping for cached, remote, and loaded-device state so one account's
  authorization cannot be reused for another account during a render
- Race-safe task loading that reads the latest authorization after the
  asynchronous repository load and ignores obsolete account loads

Focused tests verify:

- Missing cached state remains unresolved instead of becoming disabled
- Cached enabled and disabled states restore correctly offline
- Fresh server state overrides stale cached state
- Web cache storage is inert during server rendering and supports round-trip
  persistence and removal
- Task and Check-In scheduling paths guard unresolved authorization
- Web reminders enforce device authorization
- Revocation and deletion paths remove cached authorization
- The configured production web export, all 12 web artifact checks, and both
  native Hermes exports pass from the same source state

## Reminder Device Demotion Milestone

This milestone closes a duplicate-reminder edge case in primary-device
switching:

- Promoting a new primary reminder device atomically clears both
  `primary_reminder` and `notifications_enabled` on every other active device.
- The promoted device becomes primary with reminders enabled.
- A demoted device remains quiet until the user explicitly enables it as a
  secondary reminder device.
- The change is a forward migration and does not rewrite previously applied
  schema history.
- All four migrations apply cleanly from scratch and database lint reports no
  findings.
- `pnpm verify:supabase` passes 37 authenticated database checks, including two
  real primary switches across trusted devices, plus 12 live deletion-function
  checks.

## Remaining Acceptance Gates

Connected Supabase project:

- Configure and exercise hosted Google, Apple, GitHub, and email-code
  providers.
- Apply and lint the proven migrations against the selected EU Supabase
  project.
- Repeat cross-account RLS, unauthorized RPC, and trusted-device approval
  tests against the deployed project.
- Measure two-client encrypted sync and missed-broadcast recovery.
- Validate live reminder-device ownership and revocation against the hosted
  project; local authorization resolution and integration contracts are
  covered by the automated suite.
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
