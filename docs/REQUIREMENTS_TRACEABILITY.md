# Organa MVP Requirements Traceability

Status recorded on 2026-07-24.

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
| 1 | Google, Apple, GitHub, and email account creation | OAuth and email-code adapters plus the sign-in UI are in `apps/mobile/src/auth`; local email-code contracts and a real local OTP walkthrough pass. Native PKCE callback tests and contracts cover attached browser completion, app resume, cold start, exact redirect matching, safe errors, and one-time code deduplication. | Connected gate: configure and exercise every provider and redirect on the self-hosted test instance, then repeat on the production deployment. |
| 2 | Recovery confirmation and trusted-device enrollment | `packages/crypto` tests checked `ORG1` recovery and target-bound `ODA1` transfer; 54 authenticated backend checks exercise recovery proof, approval, claim, rejection, expiry, and revocation. | Connected and separate-device recovery drills remain. |
| 3 | Create, edit, schedule, repeat, complete, and search tasks | Domain/task-context tests cover recurrence and completion; browser walkthroughs cover editor, Quick Add, dates, search, checkbox-only completion, fade, and Undo. | Physical smoke test on release builds. |
| 4 | One-off, routine, and medication behavior | Domain task kinds, one-off recurrence rejection across tasks/templates/restore, calendar recurrence, optional dose confirmation, medication copy, and completion history are implemented and tested; a live web save/reopen drill confirms One-off recurrence is cleared in both editors. | Physical notification and accessibility walkthrough. |
| 5 | Multiple reminders, snooze presets, and a primary device | Native plans, task/subtask schedules, Web Push schedules, configurable task presets, ownership cache, and primary demotion are implemented; database checks enforce quiet secondary devices. Guarded connected verifiers prepare private-channel primary/secondary ownership, target-proof/revocation, refresh invalidation, and real cron-authorized Web Push retry evidence with fail-closed VAPID validation. Focus and active-tab reminders expose every saved preset, while the compact native notification surface exposes the first two quick actions. | Pass the connected live-session, Web Push scheduler, and rendered-client cleanup drills, exercise physical native actions and release-browser Push, then repeat against production. |
| 6 | Subtasks and optional subtask reminders | Editor, explicit inherited-reminder materialization, domain schedules, completion reconciliation, native payloads, Web Push plans, and browser persistence/ARIA drills provide local evidence. | Physical notification action drill. |
| 7 | Today, priority/time lanes, week/month calendar | `today-screen.tsx`, `planning-calendar.tsx`, and task planning/domain tests implement these views; browser walkthrough covers switching and task placement. | Release-device responsive smoke test. |
| 8 | Browse, copy, create, edit, and delete templates | Template domain/context/screen code and tests cover official/private behavior, search, copy-before-edit, deletion, and date-safe instantiation. | Release-device smoke test. |
| 9 | Focus from a task or reminder | Focus route, native response coordinator, active-tab reminder, Web Push deep link, and widget routes are implemented; payload/route tests pass. | Physical notification/widget and permission-granted Web Push drills. |
| 10 | Check-In mood, label, reflection, reminder, search, trends | Domain validation/tests and Check-In UI implement one daily entry, mood 1-5, one-word label, optional reflection, 7/30-day trends, search, and separate reminders. | Physical/system reminder drill. |
| 11 | Continuous, searchable, offline, safely merged Brain Dump | IndexedDB/SQLite repositories, encrypted Yjs updates, merge tests, single-runtime verifier, browser editing walkthrough, and exact-set advisory-lock compaction of new bullet-scoped deltas provide local evidence. Legacy deltas remain compatible and concurrent/offline edits defer or replay safely. | Connected two-client reconnect plus concurrent-compaction and sustained-volume validation; repeat against production. |
| 12 | Mobile next-reminder and today widgets | iOS extension timelines and Android AppWidget providers implement both views, deep links, light/dark accessible rendering, bounded secure transition caching, periodic refresh, and content-free cleanup; both Hermes exports pass. | Physical iOS and Android rendering, resize, rollover, cleanup, and deep-link interaction. |
| 13 | Offline after initial sign-in | Local repositories/outbox and auth storage are implemented; production PWA offline sign-in/reload/mutation/reconnect drill passed. | Physical killed-process native drill. |
| 14 | Active-device sync and offline recovery | Encrypted outbox, idempotent mutation RPC, private Broadcast, field merge, paginated initial pulls, timestamp-safe durable reconciliation, visible read-side health, and a two-origin local realtime drill provide local evidence. | Self-hosted latency, missed-event, large-account, and network-transition drills, followed by production repeat. |
| 15 | End-to-end encrypted content inaccessible to backend | AES-256-GCM field envelopes, wrapped web keys, SecureStore native keys, protected browser session/device-proof storage, fail-closed public endpoint/key validation, a trusted Web Push-host egress boundary, ciphertext-only database inspection, RLS/RPC tests, and an explicit data/retention/processor map provide local evidence. | Independent cryptographic/application review, connected abuse testing, production operations review, and legal validation of store declarations. |
| 16 | Light, dark, system, and manual themes | Theme tokens, system preference, manual override, synchronized settings, contrast checks, and browser walkthrough provide local evidence. | Physical system-theme and dynamic-type smoke test. |
| 17 | Installable offline PWA | Manifest, icons, eight static routes, tested waiting-worker discovery/dismissal/activation/fallback, Workbox shell, 18 artifact checks, 22 precache URLs, an offline drill, and a real same-origin marked-worker replacement drill pass. | Repeat install/update in every supported release browser and installed mode. |
| 18 | Export and one-hour deletion | Readable JSON/Markdown, strict encrypted backup validation against task/Check-In domain invariants, read-only boundary, cancellation UI, scheduled finalizer, 13 live function checks, local cascade coverage, and a separately consented real-time connected verifier. | Pass `verify:connected:deletion`, complete a separate clean-device restore drill, then repeat against production. |
| 19 | Accessibility for critical workflows | Semantic roles/states, labels, keyboard focus CSS, reduced-motion handling, AA token contrast, shared native hit areas, 24-pixel web targets, 44-pixel coarse-pointer expansion, uncapped system text scaling, native-only completion haptics with non-disruptive failure handling, browser DOM measurements, keyboard/ARIA walkthroughs, and Lighthouse evidence exist. | VoiceOver, TalkBack, largest-text-size, physical touch-target, sound/haptic preference, and release-browser walkthroughs. |
| 20 | Critical/high security findings resolved | Security design, local abuse verifiers, dependency audit, and production gates are documented. | External gate: commission the independent review and resolve every critical/high finding. |

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
- `pnpm verify:supabase`: 6 migration-preservation, 54 database, 13
  deletion-function, and 15 Web Push function checks pass
- `pnpm build:web`: 18 production artifact checks and 22 precache URLs pass
- `pnpm build:native`: iOS and Android Hermes exports pass
- `pnpm audit --prod`: no known production vulnerabilities
- `apps/mobile/eas.json` defines clean-commit preview/store profiles with
  explicit EAS environments, remote build-number management, and draft
  Android internal-track submission; `docs/RELEASE_RUNBOOK.md` defines the
  credential, artifact, physical-check, and evidence handoff

## Completion Boundary

All locally executable feature work in this matrix must remain green. The MVP
cannot be called controlled-beta-ready until the connected, physical, and
external gates in this file and `docs/ACCEPTANCE.md` have direct evidence.
