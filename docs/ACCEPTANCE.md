# Controlled-Beta Acceptance

Status recorded on 2026-07-25.

The criterion-by-criterion status and evidence boundary is recorded in
`docs/MVP_TRACEABILITY.md`.

## Implemented And Locally Verified

- [x] Task creation, editing, scheduling, recurrence, completion, Undo, search,
  priority/time lanes, week/month calendar, inbox, and history
- [x] One-off, routine, medication, dose confirmation, subtasks, and
  independently configurable optional subtask reminders
- [x] Multiple reminder stages and per-task snooze presets, with every saved
  preset available from Focus and active-tab reminders
- [x] Persistent, dismissible delivery notices when system reminder
  permission or scheduling is unavailable
- [x] Templates browse/copy/create/edit/delete
- [x] Focus mode and reminder deep links
- [x] Optional Check-In mood/reflection/search/trends/reminder setting
- [x] Continuous searchable Brain Dump and Yjs merge tests
- [x] Platform-separated Brain Dump Enter handling so one web or native
  submission creates exactly one next bullet
- [x] Race-safe encrypted Brain Dump update compaction with exact-set locking,
  offline-safe retry, legacy-client compatibility, and bounded new delta rows
- [x] Atomic cleanup of current structured Brain Dump deltas and history on
  bullet deletion, with stale server writes rejected and in-flight client
  updates ignored after the tombstone
- [x] Local two-session Brain Dump backend drill with client-format AES-GCM
  fields, concurrent Yjs edits from two trusted device proofs, order-independent
  convergence, durable missed-event recovery, exact-set compaction, and a real
  delete-versus-update race
- [x] SQLite native persistence and IndexedDB web persistence
- [x] Encrypted field outbox, idempotent RPC contract, private Broadcast, and
  incremental durable reconciliation integration
- [x] Atomic local-record plus encrypted-outbox commits for every structured
  user mutation, including recurring-task pairs and multi-record restores
- [x] Explicitly paginated encrypted pulls and visible read-side sync health
- [x] Recovery-key confirmation and recovery-code restore flow
- [x] Short-lived encrypted new-device approval by an existing trusted device,
  including explicit approve/reject and one-time target-bound key handoff
- [x] Trusted reminder-device controls and reconnect-time revocation cleanup
- [x] Local readable/encrypted exports, validated backup restore/merge, and
  one-hour deletion UI/backend worker
- [x] Light/dark/system themes, reduced motion, sounds, haptics, and app lock
- [x] iOS and Android widgets for today's tasks and the next actual enabled
  task or subtask reminder trigger, with deep links and timeline transitions
- [x] Installable PWA manifest, icons, static routes, signed-in offline reload,
  local mutation persistence, and reconnecting outbox
- [x] Standards-based Web Push with proof-gated content-free schedules,
  generic service-worker notifications, and an active-tab fallback
- [x] Keyboard roles/labels, visible focus, semantic state, reduced motion, and
  AA light/dark theme token contrast
- [x] Shared native hit areas, WCAG-sized web controls, coarse-pointer
  expansion, and uncapped system text scaling
- [x] Source-pinned iOS 16.4+ and Android 7+/API 36 build targets plus a
  documented browser and platform capability matrix
- [x] Native OAuth callback recovery across attached browser sessions, app
  resume, and cold start with one-time PKCE exchange deduplication
- [x] Account-scoped content-key readiness and runtime validation for native
  and web key-vault records
- [x] New, restored, and legacy local Check-In rows use deterministic opaque
  record IDs derived from the account content key with
  HKDF/HMAC-SHA-256; calendar dates remain inside encrypted fields while
  same-day multi-device writes still converge
- [x] Browser auth sessions and device proof secrets migrate from plaintext
  local storage into record-bound AES-GCM IndexedDB entries with
  non-extractable wrapping keys where supported
- [x] Client backend setup rejects remote HTTP, URL credentials/placeholders,
  and non-publishable or secret-style Supabase keys without reflecting values
  in the setup UI

Local evidence:

- strict TypeScript passes for all packages
- 151 automated tests pass: 43 domain, 6 cryptography, and 102 application
  tests
- OAuth callback tests accept only the configured app redirect, map remote
  provider errors to safe local copy, deduplicate simultaneous and repeated
  one-time codes, and allow a failed exchange to be retried
- the authentication contract pins the `organa` scheme, local Supabase
  redirect allowlist, PKCE mode, platform auth storage, initial native URL
  recovery, resumed URL handling, and attached browser-session handling
- completion-feedback tests prove iOS and Android use their native system
  haptic effects, web remains quiet, the preference disables feedback, and
  unavailable haptic hardware does not interrupt task completion
- optional creation/completion audio failures are absorbed instead of
  producing an unhandled task-interaction rejection
- app-lock state tests prove disabled startup, enabled startup, unavailable
  device authentication, malformed/unreadable secure preferences, and
  background transitions; uncertain native state always remains locked
- the app-lock integration contract keeps startup loading separate from
  foreground locking, restores the unlock control after thrown native errors,
  and pins every private data provider inside the loading/locked boundary
- the security provider exposes an in-memory content key only when its atomic
  owner ID matches the active account or isolated local-preview identity;
  malformed persisted keys fail closed
- deletion state and trusted-device lists are hidden unless their fetched
  owner matches the active account; revocation/final-deletion cleanup uses
  ordered phases, attempts every private store and sign-out, and retries only
  failed operations once
- destructive cleanup keeps the authenticated session and device proof alive
  through platform/server-subscription cleanup, signs out next, and removes
  the content key and device identity last; web key-vault deletion errors are
  surfaced rather than misreported as successful erasure
- cached account-deletion state can preserve read-only mode offline but cannot
  trigger local erasure; a strict authenticated status RPC uses server time for
  the cancellation deadline and local cleanup starts only after the server
  proves the deadline is irreversibly closed or the Auth user has been removed
- destructive revocation/deletion cleanup verifies the currently persisted
  Supabase session still belongs to its expected owner before any account or
  device-global store is touched; delayed account-A work cannot clear account B
- native and web device identities share strict persisted-state parsing, and a
  successful server read that proves the current identity missing, untrusted,
  or revoked triggers private local erasure; an unreachable server preserves
  offline access
- recovery and approval envelopes must match their expected key/device IDs;
  decrypted approval keys are persisted only after server trust is confirmed,
  and ambiguous committed RPC responses require matching server state
- recovery/approval UI state is account-bound, successfully used codes are
  erased immediately, and approving devices hide unclaimed codes at server
  expiry without waiting for a realtime event
- domain tests cover grace-window exhaustion, recurring task-type eligibility,
  multiple selected weekdays, multi-week intervals, monthly short-month
  clamping and anchor recovery, due-time shifting, invalid recurrence rules,
  one-off recurrence rejection, and stale-schedule catch-up without backlog
  creation
- task inbox tests cover undated, today, future, grace-window, overdue, and
  completed placement plus searchability
- static security-contract tests prevent direct account-key writes and
  proofless privileged RPC signatures
- all nine migrations apply from scratch to local Supabase/PostgreSQL and
  `db lint --local --level warning` reports no schema errors or warnings
- `pnpm verify:migrations` passes 6 upgrade checks after seeding the original
  schema with synthetic account keys, devices, encrypted records, encrypted
  history, outbox mutations, and deletion state; every seeded row remains
  byte-for-byte unchanged after all later migrations
- rollback-only local PostgreSQL drills prove that active date-bearing
  Check-In IDs are rejected, opaque IDs are accepted, and deleting a legacy
  ID through the authenticated mutation RPC purges its active row, history,
  and mutation metadata while still returning the applied version
- `pnpm verify:supabase` includes those 6 migration checks and passes 75
  authenticated database checks covering
  cross-account RLS, direct-write denial, invalid proofs, encrypted
  trusted-device approval and claim, envelope erasure, request rejection,
  revocation, anonymous denial, deletion read-only enforcement,
  duplicate-safe primary reminder-device switching, proof-gated Web Push
  scheduling/removal, hidden endpoint capabilities, demotion cleanup, and a
  real client-format encrypted Brain Dump lifecycle
- the Brain Dump database phase uses two authenticated sessions and two trusted
  device proofs, verifies that durable rows contain no plaintext thought
  content, decrypts and merges concurrent Yjs deltas in both orders, rejects an
  incomplete compaction set, retains one converged encrypted snapshot, and
  proves a deletion race leaves no identifiable delta row or history
- the same command passes 13 live account-deletion Edge Function checks
  covering scheduler
  authorization, POST-only execution, the one-hour deadline, due processing,
  and cascading removal of the Auth user, sessions, device keys, and encrypted
  records, including Web Push subscriptions and schedules
- a rollback-only authenticated database drill verifies the deletion-status RPC
  returns `none`, `pending` with server-derived `due=false`, `pending` with
  `due=true`, and `deleted` after Auth cascade; anonymous execution is denied
- the same command passes 15 live Web Push Edge Function checks covering
  scheduler authorization, POST-only execution, one-shot completion, and
  daily Check-In advancement in the selected local time zone
- `pnpm verify:web-push` constructs a real VAPID-authorized request and verifies
  its payload uses `aes128gcm` encryption without plaintext leakage
- local Supabase sends the six-digit code expected by both the first-time and
  returning-user passwordless sign-in forms
- a two-origin browser walkthrough completed recovery setup, requested and
  approved a target-bound device handoff, unlocked the second client, removed
  the claimed code from the approving UI, and kept secondary reminders off
- a task created on the newly approved browser appeared on the original browser
  through encrypted realtime synchronization without a reload
- a connected disposable-browser drill enrolled a first device, changed only
  that server record to untrusted, received the private device-channel update,
  erased local security state, and returned to sign-in; signing the same
  account in again reached the New Device recovery boundary rather than
  reopening cached private content, and the disposable account was removed
- initial encrypted record pulls page deterministically by record type and ID;
  durable reconciliation drains every record sharing a server timestamp before
  advancing, then overlaps the next pass to recover boundary races
- pull, decryption, and durable reconciliation failures remain separate from
  outbox state and force a route-wide accessible "Sync needs attention" notice;
  compact layouts also expose offline and pending status
- task, template, Check-In, settings, and Brain Dump user mutations no longer
  launch independent local and outbox writes; one owner-validating adapter
  commits both in a single IndexedDB transaction or exclusive SQLite
  transaction, and serializes encryption/commit order
- recurring completion plus next-occurrence creation, recurring reopen plus
  generated-occurrence removal, preview seeding, and every restore batch commit
  as one local/outbox unit; a failed durable commit leaves neither side and
  raises a sticky route-wide warning that does not falsely claim the change is
  safe
- task, template, Check-In, settings, and Brain Dump startup reads handle
  repository rejection explicitly; Organa enters an accessible fail-closed
  local-data boundary that blocks editing instead of exposing empty/default
  state that could overwrite unread records
- a failed initial Supabase session lookup releases the authentication loading
  state and shows a sign-in recovery message, while a newer auth-state event
  cannot be overwritten by the older lookup result
- remote delivery waits for the ordered local commit chain before applying a
  row, preventing a canonical Brain Dump snapshot from racing and overwriting
  the local projection of an encrypting CRDT delta; canonical deletion
  tombstones remain authoritative and are never hidden behind a parent alias
- incoming task, template, Check-In, settings, and Brain Dump listeners
  acknowledge delivery only after their repository operation succeeds;
  reconciliation does not advance its cursor past a failed local write, and
  the failure remains visible through sync health for a later retry
- the complete private provider tree is keyed to the authenticated owner and
  remounts on an account change, so state, repositories, subscriptions,
  reminder coordinators, and in-flight provider bookkeeping cannot be reused
  by the next account
- every synchronized feature captures its local record revision before waiting
  for startup hydration, rejects a stale remote operation before its repository
  write, and checks the revision again before UI or reminder effects; a local
  action in either asynchronous handoff therefore remains authoritative
- Brain Dump applies local reducer actions to an eager state reference, runs
  remote bullet and update callbacks through one ordered queue, and retries a
  merged Yjs projection when typing overlaps a repository write; deletion
  tombstones reject pre-delete callbacks but can be replaced by a later
  authoritative restore of the same bullet
- concurrent initial, realtime, acknowledgement, and reconciliation pulls are
  serialized per record; the highest observed server version wins even when an
  older request finishes later, while each active subscriber independently
  records successful durable delivery
- a temporary real-browser IndexedDB drill passed 9 checks: successful task
  and outbox persistence, forced mid-batch unique-index rollback with no
  partial Check-In or mutation, atomic recurring pairs, and pre-write owner
  rejection
- all 151 existing tests pass unchanged, strict TypeScript passes, production
  web/PWA artifact verification passes 18 checks with 22 precached assets, and
  iOS and Android Hermes exports succeed after the atomic persistence changes
- after provider hydration/realtime ordering hardening, all 151 existing tests,
  uncached strict TypeScript, the Yjs development-runtime verifier, all four
  100 ms performance contracts, the 18-check/22-URL production PWA verifier,
  both native Hermes exports, and all 19 platform checks pass; no test file was
  changed
- strict TypeScript, production web/PWA artifact verification, and iOS/Android
  Hermes exports pass after the sync pagination and health changes; no test
  files were changed
- Expo Doctor passes 19/20 checks after native project generation; the only
  remaining check is host tooling because CocoaPods/full Xcode are not
  installed on this machine
- clean Expo Prebuild succeeds without configuration warnings
- generated Android configuration disables application backup and removes
  recording, background-audio, broad-storage, and overlay permissions
- generated Android configuration registers Today Tasks and Next Reminder
  AppWidget providers, Java receivers, resize metadata, descriptions, and
  30-minute launcher updates
- the Android Hermes export succeeds; a local Gradle APK build remains
  unverified because this host has Java 17 but no Android SDK installed
- generated iOS configuration has no microphone or background-audio
  declarations, uses the explicit widget bundle ID, and produces an opaque
  1024-pixel App Store icon
- source configuration pins iOS 16.4 and Android API 24/36/36
  minimum/compile/target values, matching the documented Expo SDK 57 support
  contract
- EAS configuration now separates internal preview artifacts from
  auto-incremented store builds, requires a clean commit, binds each profile to
  its matching environment, and submits Android to the internal track as a
  draft; project linking, credentials, and real artifacts remain release gates
- the EAS profile JSON and resolved public Expo configuration validate locally;
  strict TypeScript, the production PWA export, both Hermes exports, and the
  production dependency audit pass; no tests were added, changed, or run for
  the release-packaging milestone
- runtime dependency, logging, endpoint, permission, Push-payload, and schema
  inspection found no analytics, advertising, session-recording, automatic
  crash-reporting, or user-content logging path; the engineering privacy map
  records actual local/cloud data, metadata, retention, processors, user
  controls, and unresolved store/legal decisions
- `pnpm verify:platform` passes 19 checks for source and generated target
  values, sensitive Android manifest boundaries, the browser policy, and both
  mobile widget implementations
- `pnpm verify:performance` exercises the exact local task-list update model,
  recurring completion, Today planning, and search against 2,000 tasks with a
  100 ms median budget; physical release-device timing remains required
- iOS and Android Hermes bundle exports succeed
- native notification-plan tests cover task/subtask payloads, Focus and snooze
  actions, killed-app-compatible response delivery, completion suppression,
  Check-In routing, and categorized repeat snoozes
- completing or reopening a subtask now replaces that task's scheduled
  notifications so finished steps do not leave stale alerts
- iOS widget timeline tests prove automatic local-midnight task rollover and
  advancement after each reminder trigger without reopening the app
- Android widgets use light/dark accessible renderings, a bounded SecureStore
  transition timeline, app-driven updates, launcher refresh, and Home/Focus
  deep links; overflow ends in a content-free state rather than stale titles
- account deletion and device revocation clear scheduled and displayed native
  notifications and replace both iOS and Android widgets with content-free
  states before local database deletion
- normal and Supabase-driven sign-out clear scheduled/displayed native
  notifications and replace iOS/Android widgets with content-free states
  without deleting the returning user's local repositories
- native widget publishing is serialized and owner-scoped; Android timeline
  persistence and widget redraw are one ordered operation, and account cleanup
  is a final content-free barrier that cannot be followed by an in-flight old
  account write
- task, Check-In, Focus, and notification-action scheduling share an
  owner-aware native notification queue; account changes insert a cancel-all
  barrier, and sign-out/deletion cleanup waits behind every earlier permission,
  cancellation, or scheduling operation before removing private notifications
- browser task and Check-In Web Push writes share the same owner-aware
  boundary; initial and online-triggered flushes are serialized with
  authenticated server-subscription removal, so a delayed old-account flush
  cannot recreate a schedule after sign-out or final-deletion cleanup
- native privacy cleanup also clears Expo's last notification-response payload,
  preventing a later account from inheriting a previous task/check-in route;
  web active-tab reminder history is owner-scoped and all Organa history keys
  are removed on sign-out
- per-user reminder authorization is restored from a content-free local cache
  during offline startup; unresolved ownership does not cancel existing native
  schedules, and fresh server device state always overrides the cache
- task and Check-In schedulers guard unresolved reminder ownership, web
  active-tab reminders honor primary/secondary device settings, and revocation
  or final account deletion removes the authorization cache
- task and Check-In saves remain successful when reminder delivery is
  unavailable, while a global accessible notice reports permission,
  capability, scheduling, and cancellation failures instead of silently
  implying delivery
- strict TypeScript and the web, iOS, and Android production exports pass after
  the non-silent reminder-delivery changes; no test files were changed
- native notification quick actions expose the first two task presets within
  the compact system action surface; Focus exposes every saved preset and
  schedules a real local notification after permission and reminder-device
  authorization checks
- browser Focus and active-tab reminders expose every saved preset; Focus
  snoozes are explicitly open-app timers rather than falsely claiming
  closed-tab Web Push delivery
- browser Focus snooze timers are tagged to their account owner and canceled
  on account change, sign-out, revocation, or final deletion; delivery also
  requires the active owner and rebuilds copy from that owner's current task,
  so a restored task ID cannot expose another account's captured title
- Focus task and break timers use a wall-clock deadline rather than counting
  JavaScript interval ticks; pause uses the current deadline, and returning
  from mobile background suspension immediately reconciles the displayed
  remaining time instead of extending the session silently
- timer completion adds a pressure-free polite accessibility announcement
  without making the changing countdown a live region
- task completion, subtask completion, preset edits, remote reconciliation,
  and reminder-device demotion prevent stale snoozes from being delivered;
  native reconciliation also dismisses matching notifications already shown
- strict TypeScript and production web, iOS, and Android builds pass for the
  snooze-fidelity changes; no tests were added, changed, or run for this
  milestone
- promoting a new primary reminder device atomically makes every other device
  quiet; a demoted device requires a later explicit secondary-reminder opt-in
- a task-load race test contract verifies that reconciliation reads the latest
  authorization after asynchronous repository loading
- production web export succeeds
- production web artifact verification passes 18 installability, offline,
  controlled-update, and Push-handler checks
- Workbox precaches 22 URLs, including every font weight loaded before render,
  both optional interaction sounds, and the Push handler
- PWA update tests cover waiting-worker discovery, dismiss/restart state,
  one-shot controller handoff, a five-second fallback, and failed
  registration/message paths
- a real same-origin production PWA drill installed a controlling worker,
  staged a byte-distinct replacement, verified Later and reprompt behavior,
  then activated a marked third version with one reload and no stale prompt
- production Lighthouse scores 100% for accessibility and 100% for best
  practices on the configured sign-in screen
- a fresh-origin production setup-required render exposes one `main`
  landmark, an H1 page title, an H2 setup title, a semantic promise list, and
  a labeled setup region; the browser console contains no warning or error
- a fresh development-preview browser session exposes exactly one `main`
  landmark and one H1 across Today, Check-In, Brain Dump, Library, Account,
  and Focus; the five standard routes expose exactly one labeled primary
  navigation landmark, while Focus intentionally removes global navigation
- a separate fresh preview directly proves Home's source and accessibility
  order is Priority lane, Time lane, Quick Capture, then Task Inbox, keeping
  today's active work ahead of capture as required
- recovery setup/restore, app lock, and deletion safety screens expose a main
  landmark, a heading, and non-interruptive loading status; the deletion
  countdown remains readable on demand without announcing every second
- optional interaction audio now stays silent until a fail-closed audio mode
  is ready, explicitly respects silent mode, does not play in the background,
  and mixes rather than interrupting other audio; a live preview with sounds
  enabled created and completed a task without a runtime failure
- the last production dependency audit reported no known vulnerabilities
  before the opaque-ID crypto dependency was added; the current lockfile's
  online advisory audit remains a release gate because sandboxed npm audit
  could not resolve the registry and unsandboxed dependency-graph disclosure
  was not authorized
- the installed `@noble/hashes` `2.2.0` manifest and lock entry identify one
  integrity-pinned MIT package with no runtime dependencies; this targeted
  inspection does not replace the pending full production audit
- browser walkthrough passed task, Undo/fade, checkbox-only reopening, separate
  medication dose confirmation, editor, Check-In, Brain Dump, templates,
  navigation, accessibility-tree, and focus-indicator checks
- a focused Brain Dump browser drill started with one editable bullet, pressed
  Enter once, observed exactly two editors and a count of two thoughts, and
  confirmed focus moved to the single new blank bullet; temporary bullets were
  removed and the browser emitted no warning or error
- browser target-size audit found no visible control below 24 by 24 CSS pixels
  across Today, Check-In, Brain Dump, Templates, and Account; coarse-pointer
  web targets expand to 44 by 44 and native pressables share a 14-point hit area
- browser backup drill rejected an invalid file, restored a real AES-GCM
  backup through the file chooser, and verified the imported task and settings
  persisted after reload
- a clean-client recovery drill exported a real encrypted backup from an
  authenticated `localhost` account, confirmed the file contained no task
  plaintext, then restored it through the real file chooser into a separately
  enrolled account on the untouched `127.0.0.1` origin; the one task and dark
  theme appeared only after restore and both survived a full reload
- the same drill exposed and fixed partial first-settings hydration and missing
  recovery-envelope persistence; with Supabase stopped, the restored task and
  dark theme remained available and encrypted full backup stayed enabled from
  the protected local vault
- encrypted backup validation rejects zero/duplicate/out-of-order snoozes,
  one-off recurrence, invalid grace-day placement or limits, non-medication
  dose confirmation, and empty, padded, or multi-word Check-In feeling labels
  before any repository write
- Check-In save now waits for the atomic local/encrypted-outbox commit before
  claiming success, preserves edits made during an in-flight save as unsaved,
  and reports a pressure-free retry message when derivation or persistence
  fails
- Check-In realtime delivery waits for account-scoped local hydration, so a
  remote row cannot be overwritten in memory by a later stale startup load
- task and template editors clear/hide recurrence when One-off is selected;
  enabling per-step reminder configuration materializes inherited timings so
  visible chips and the saved schedule agree
- a live web walkthrough verified One-off-to-Routine-to-One-off transitions in
  both editors; a task save/reopen cycle retained One-off with no repeat
  control or recurrence
- browser subtask-reminder drill verified independent timing choices,
  persistence after reopening, and explicit checked/selected ARIA states
- template tests prove occurrence-specific dates/series metadata are removed
  and enabled reminder presets receive a fresh local due timestamp when used;
  the official Morning medication reminder now schedules from its selected day
  and time
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
- browser UI verification showed the configured system-reminder and fallback
  copy; the in-app browser did not grant notification permission, so
  permission-granted closed-app delivery remains a release-browser gate

## Requires Connected Backend Validation

- A self-hosted Docker instance may provide functional evidence for this
  section when it follows `docs/SELF_HOSTED_TESTING.md`. It does not replace
  the final region, operations, legal, or independent-review gates.
- `pnpm verify:connected:acceptance:deletion` is prepared to capture the real
  one-hour scheduler and cascade evidence after rerunning the connected
  baseline. It has not been run against a connected backend in this workspace,
  so the corresponding row remains unchecked.
- `pnpm verify:connected:acceptance` prepares direct private-channel evidence
  for primary ownership, explicit secondary opt-in, target revocation, proof
  denial, refresh-session invalidation, encrypted Brain Dump delta latency,
  missed-event recovery, convergence, compaction, and delete-versus-update
  safety. It remains unclaimed until the connected command and rendered-client
  cleanup/editing drills pass.
- `pnpm verify:connected:acceptance:web-push` is prepared to rerun the baseline
  and observe a real cron-authorized claim and retry through a VAPID-validated
  dispatcher. It has not been run against a connected backend, so
  function/scheduler and browser-delivery rows remain unchecked.
- Connected phases record each exact synthetic email before account creation,
  reconcile transport-ambiguous creations for 20 seconds, verify exact-email
  absence after cleanup, and fail rather than printing success when cleanup or
  interruption occurs.
- Passing evidence also requires the same clean Organa commit and exact
  operator configuration before every phase and at the end of the run.
  Evidence records sanitized interruption/process outcomes and input-state
  confirmations without keys, key-derived digests, sessions, proofs, payloads,
  or user content.
- The dispatcher now fails closed on a missing/malformed trusted Push-host
  allowlist and removes unlisted subscriptions before network access. Actual
  release-browser endpoint compatibility remains part of the browser-delivery
  drill.
- [ ] Google, Apple, GitHub, and email OTP against configured connected
  providers
- [ ] Apply and lint the proven migrations against the self-hosted test
  instance, then repeat against the selected production deployment
- [ ] Repeat cross-account RLS, unauthorized RPC, and trusted-device approval
  checks against the connected test instance and production deployment
- [ ] Two-client encrypted sync latency and missed-broadcast recovery
- [ ] Device reminder ownership and revocation across live sessions
- [ ] Configure VAPID/function secrets and the once-per-minute Web Push
  dispatcher schedule
- [ ] Permission-granted closed-app Web Push delivery, deep-link,
  replacement, cancellation, denial fallback, and sign-out drill in every
  supported release browser; iOS/iPadOS uses an installed Home Screen PWA
- [ ] Repeat the scheduled deletion finalizer drill against the connected
  backend

## Requires Physical Device Validation

- [ ] iOS and Android local notification scheduling/action/snooze
- [ ] Offline reminders after process termination
- [ ] Encrypted export restore on a separate physical release device
- [ ] Biometric/device-PIN app lock
- [ ] Sound and haptic preference behavior
- [ ] iOS and Android widget rendering, resize, rollover, cleanup, and deep links
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
