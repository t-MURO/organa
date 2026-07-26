# Organa MVP Requirements Traceability

Status recorded on 2026-07-26.

This matrix audits the 20 controlled-beta acceptance criteria in
`REQUIREMENTS.md` against current direct evidence. A locally implemented row is
not presented as production-ready when hosted-provider, release-browser,
physical-device, legal, or independent-review evidence is still required.

Status meanings:

- **Local verified:** implementation and repeatable local evidence exist.
- **Connected gate:** the selected hosted EU project or provider must be used.
- **Physical gate:** a signed build on supported hardware is required.
- **External gate:** independent review or organizational approval is required.

## Acceptance Matrix

| # | Requirement | Current evidence | Remaining gate |
| --- | --- | --- | --- |
| 1 | Google, GitHub, and email account creation | OAuth and email-code adapters plus the sign-in UI are in `apps/mobile/src/auth`; local email-code contracts and a real local OTP walkthrough pass. Native PKCE callback tests and contracts cover attached browser completion, app resume, cold start, exact redirect matching, safe errors, and one-time code deduplication. | Connected gate: configure and exercise every provider and redirect on the connected test deployment, then repeat on production. |
| 2 | Recovery confirmation and trusted-device enrollment | `packages/crypto` tests checked `ORG1` recovery and target-bound `ODA1` transfer; 75 authenticated backend checks include recovery proof, approval, claim, rejection, expiry, and revocation. Native/web identity parsing rejects malformed stored fields, and a successful device-list read erases local private state when the current identity is missing, untrusted, or revoked without weakening genuine offline access. Connected disposable-browser drills directly proved untrusted-device broadcast, erasure/sign-out, recovery-required reentry, and encrypted recovery into a separately enrolled clean client. | Physical separate-device recovery plus malformed/missing-identity drills remain; repeat against the home-server and production deployments. |
| 3 | Create, edit, schedule, repeat, complete, and search tasks | Domain/task-context tests cover recurrence and completion; browser walkthroughs cover editor, Quick Add, dates, search, checkbox-only completion, fade, and Undo. | Physical smoke test on release builds. |
| 4 | One-off, routine, and medication behavior | Domain task kinds, one-off recurrence rejection across tasks/templates/restore, calendar recurrence, optional dose confirmation, medication copy, and completion history are implemented and tested; a live web save/reopen drill confirms One-off recurrence is cleared in both editors. | Physical notification and accessibility walkthrough. |
| 5 | Multiple reminders, snooze presets, and a primary device | Owner-aware serialized native and browser notification scheduling and cleanup, native plans, task/subtask schedules, Web Push schedules, configurable task presets, ownership cache, and primary demotion are implemented; database checks enforce quiet secondary devices. The managed connected-test project has deployed VAPID/function secrets, active once-per-minute scheduling, three consecutive successful cron runs per job, HTTP 200 `pg_net` responses, and direct scheduler-authenticated function responses. Guarded connected verifiers prepare private-channel ownership/revocation and synthetic Web Push retry evidence with fail-closed VAPID validation. Focus and active-tab reminders expose every saved preset, while the compact native notification surface exposes the first two quick actions. | Pass the connected live-session and synthetic Web Push delivery phases, rendered-client cleanup, physical native actions, and release-browser Push, then repeat against production. |
| 6 | Subtasks and optional subtask reminders | Editor, explicit inherited-reminder materialization, domain schedules, completion reconciliation, native payloads, Web Push plans, and browser persistence/ARIA drills provide local evidence. | Physical notification action drill. |
| 7 | Today, priority/time lanes, week/month calendar | `today-screen.tsx`, `planning-calendar.tsx`, and task planning/domain tests implement these views; browser walkthrough covers switching and task placement. A fresh preview directly proves the required Home order places Priority and Time lanes before Quick Capture. Responsive drills at `390px`, the `900px` sidebar seam, the `1120px` Check-In grid seam, and `1920px` directly verify compact navigation, adaptive single/two-column composition, widened centered canvases, and no horizontal document overflow. | Release-device responsive smoke test. |
| 8 | Browse, copy, create, edit, and delete templates | Template domain/context/screen code and tests cover official/private behavior, search, copy-before-edit, deletion, and date-safe instantiation. | Release-device smoke test. |
| 9 | Focus from a task or reminder | Focus route, background-safe wall-clock task/break timers, native response coordinator, active-tab reminder, Web Push deep link, and widget routes are implemented; payload/route tests pass. A custom unmatched route gives obsolete notification, widget, and PWA paths a calm return to Today instead of exposing framework UI. | Physical notification/widget and permission-granted Web Push drills. |
| 10 | Check-In mood, label, reflection, reminder, search, trends | Domain validation/tests and Check-In UI implement one daily entry, mood 1-5, one-word label, optional reflection, 7/30-day trends, search, separate reminders, durable save feedback, and keyed deterministic opaque IDs with atomic legacy migration that preserve same-day multi-device convergence without exposing the date. | Physical/system reminder drill. |
| 11 | Continuous, searchable, offline, safely merged Brain Dump | IndexedDB/SQLite repositories, encrypted Yjs updates, an eager local reducer reference, serialized remote-operation delivery, revision-aware merge-and-persist retry, restore-safe deletion tombstones, merge tests, single-runtime verification, and browser editing provide local evidence. A two-session backend drill now uses real record-bound AES-GCM fields and separate trusted-device proofs to persist concurrent Yjs edits, recover durable ciphertext, prove order-independent convergence, reject incomplete exact-set compaction, retain one converged snapshot, and safely resolve a delete-versus-update race without residual identifiable deltas/history. Web and native use mutually exclusive Enter-submit handlers; a focused browser drill directly confirmed one Enter creates and focuses exactly one next bullet. | Run the prepared phase against the home server, then complete rendered two-client offline/reconnect, concurrent-compaction, sustained-volume, and physical native keyboard validation; repeat against production. |
| 12 | Mobile next-reminder and today widgets | iOS extension timelines and Android AppWidget providers implement both views, deep links, light/dark accessible rendering, bounded secure transition caching, periodic refresh, and owner-serialized content-free cleanup that cannot be undone by stale writes; both Hermes exports pass. | Physical iOS and Android rendering, resize, rollover, cleanup, and deep-link interaction. |
| 13 | Offline after initial sign-in | Local repositories/outbox and auth storage are implemented; the authenticated owner keys and remounts the complete private-provider subtree; a production PWA offline sign-in/reload/mutation/reconnect drill passed. A clean-client recovery drill also retained the restored task, dark theme, and encrypted-backup capability while local Supabase was stopped. | Physical killed-process native drill. |
| 14 | Active-device sync and offline recovery | Encrypted outbox, strictly monotonic client field timestamps, pending-record and feature-provider hydration guards, pre/post-write local revision checks, acknowledgement repulls, idempotent mutation RPC, private Broadcast, field merge, paginated initial pulls, timestamp-safe durable reconciliation, visible read-side health, and a two-origin local realtime drill provide local evidence. | Self-hosted latency, missed-event, large-account, and network-transition drills, followed by production repeat. |
| 15 | End-to-end encrypted content inaccessible to backend | AES-256-GCM field envelopes, keyed opaque Check-In record IDs with database enforcement and legacy metadata purge, wrapped web keys, SecureStore native keys, protected browser session/device-proof storage, fail-closed public endpoint/key validation, a trusted Web Push-host egress boundary, ciphertext-only database inspection, RLS/RPC tests, and an explicit data/retention/processor map provide local evidence. | Independent cryptographic/application review, connected abuse testing, production operations review, and legal validation of store declarations. |
| 16 | Light, dark, system, and manual themes | Theme tokens, system preference, manual override, synchronized settings, contrast checks, and browser walkthrough provide local evidence. The clean-client restore drill exposed and fixed partial first-settings hydration, then proved a restored dark preference across online reload and offline startup. | Physical system-theme and dynamic-type smoke test. |
| 17 | Installable offline PWA | Manifest, icons, eight static routes, tested waiting-worker discovery/dismissal/activation/fallback, Workbox shell, 18 artifact checks, 22 precache URLs, an offline drill, and a real same-origin marked-worker replacement drill pass. | Repeat install/update in every supported release browser and installed mode. |
| 18 | Export and one-hour deletion | Readable JSON/Markdown, strict encrypted backup validation against task/Check-In domain invariants, deterministic and explicitly resumable full-backup section merges, read-only boundary, cancellation UI, scheduled finalizer, 13 live function checks, local cascade coverage, an authenticated server-time status RPC that prevents stale offline cache erasure, credential-safe ordered local erasure, and a separately consented real-time connected verifier. A real ciphertext-only backup was restored through the file chooser into an independently enrolled clean browser origin; its task and dark setting survived reload, and encrypted export remained available with Supabase stopped. | Pass `verify:connected:acceptance:deletion`, repeat restore on a physical release device, then repeat against production. |
| 19 | Accessibility for critical workflows | Semantic roles/states, labels, keyboard focus CSS, reduced-motion handling, AA token contrast, shared native hit areas, 24-pixel web targets, 44-pixel coarse-pointer expansion, uncapped system text scaling, native-only completion haptics with non-disruptive failure handling, browser DOM measurements, keyboard/ARIA walkthroughs, and Lighthouse evidence exist. A fresh-origin production setup/sign-in render directly exposes one main landmark, an H1/H2 hierarchy, a semantic promise list, and a labeled setup region without browser warnings. A separate authenticated development-preview walkthrough directly proves one `main` and one H1 on Today, Check-In, Brain Dump, Library, Account, and Focus, with exactly one labeled primary navigation landmark on every standard route and none in the distraction-free Focus shell. An authenticated unmatched-route drill also directly proves one shared `main`, one labeled primary navigation, one recovery H1, one return control, and a successful replacement back to Today's H1. Root font startup now presents a main/status fallback instead of a blank body and continues past optional font failure. Recovery, app-lock, and deletion boundaries expose main/heading/status semantics, and the deletion countdown no longer interrupts screen-reader users every second. | VoiceOver, TalkBack, largest-text-size, physical touch-target, sound/haptic preference, and release-browser walkthroughs. |
| 20 | Critical/high security findings resolved | Security design, local abuse verifiers, targeted dependency inspection, and production gates are documented. A live `pnpm audit --prod --json` of the lockfile-bound 609-package production graph reports zero findings at every severity and no muted advisories. | External gate: commission the independent cryptographic/application review and resolve every critical/high finding it identifies; rerun the production audit for the release candidate. |

## Current Verification Baseline

- Native source targets are pinned to iOS 16.4+ and Android 7+ (API 24) with
  Android compile/target API 36.
- `pnpm verify:platform`: 19 source/generated target, sensitive Android
  manifest, browser-policy, and dual-platform widget checks pass
- `pnpm verify:performance`: Quick Add, recurring completion, Today planning,
  and search pass a 100 ms median budget against 2,000 local tasks on the
  verification host; release-device timing remains a physical gate
- `pnpm test`: 151 tests (43 domain, 6 cryptography, 102 application)
- app-lock state and integration contracts fail closed on unreadable or
  malformed secure preferences, preserve enabled locks when device
  authentication disappears, and keep private providers unmounted until
  startup and unlock checks pass
- content keys, deletion state, and trusted-device lists are account-scoped;
  revocation and final deletion close local auth immediately, attempt every
  private-store cleanup independently, and retry failed operations once
- recovery/device envelopes are validated against expected identifiers, and
  content keys are persisted only after matching server enrollment or approval
  state is confirmed
- recovery and approval UI secrets are account-scoped and erased after use;
  displayed one-time approval codes also clear at their server deadline
- `pnpm typecheck`: all strict TypeScript packages pass
- `pnpm verify:migrations`: 6 isolated-schema upgrade checks preserve every
  seeded encrypted/account row while installing later protected objects
- `pnpm verify:web-push`: VAPID authorization and encrypted payload pass
- `pnpm verify:supabase`: 6 migration-preservation, 75 database, 13
  deletion-function, and 15 Web Push function checks pass
- `pnpm build:web`: 18 production artifact checks and 22 precache URLs pass
- `pnpm build:native`: iOS and Android Hermes exports pass
- `pnpm verify:release:readiness`: strict private-manifest and sanitized
  connected-evidence validation binds the clean commit, EAS project, backend,
  artifacts, platform/browser drills, source gate, and external approvals; it
  remains nonzero until every release evidence group exists
- `pnpm audit --prod --json`: the live registry reports zero findings across
  all severities and no muted advisories for 609 production dependencies; the
  lockfile digest and tool versions are recorded in `docs/DEPENDENCY_AUDIT.md`
- `apps/mobile/eas.json` defines clean-commit preview/store profiles with
  explicit EAS environments, remote build-number management, and draft
  Android internal-track submission; `docs/RELEASE_RUNBOOK.md` defines the
  credential, artifact, physical-check, and evidence handoff
- `apps/mobile/app.json` links the source to live EAS project
  `@t-muro/organa` (`ae92cff5-050e-4972-808d-a393be8d67e3`);
  non-interactive EAS project inspection resolves the same owner, slug, and ID
- EAS preview and production builds run a dependency-free pre-install guard
  that rejects missing, malformed, local-only, or placeholder Supabase and
  Web Push client values without printing them

## Completion Boundary

All locally executable feature work in this matrix must remain green. The MVP
cannot be called controlled-beta-ready until the connected, physical, and
external gates in this file and `docs/ACCEPTANCE.md` have direct evidence.
