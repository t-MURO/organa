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
| 1 | Google, Apple, GitHub, and email account creation | OAuth and email-code adapters plus the sign-in UI are in `apps/mobile/src/auth`; local email-code contracts and a real local OTP walkthrough pass. | Connected gate: configure and exercise every hosted provider and redirect. |
| 2 | Recovery confirmation and trusted-device enrollment | `packages/crypto` tests checked `ORG1` recovery and target-bound `ODA1` transfer; 54 authenticated backend checks exercise recovery proof, approval, claim, rejection, expiry, and revocation. | Connected and separate-device recovery drills remain. |
| 3 | Create, edit, schedule, repeat, complete, and search tasks | Domain/task-context tests cover recurrence and completion; browser walkthroughs cover editor, Quick Add, dates, search, checkbox-only completion, fade, and Undo. | Physical smoke test on release builds. |
| 4 | One-off, routine, and medication behavior | Domain task kinds, one-off recurrence rejection across tasks/templates/restore, calendar recurrence, optional dose confirmation, medication copy, and completion history are implemented and tested; a live web save/reopen drill confirms One-off recurrence is cleared in both editors. | Physical notification and accessibility walkthrough. |
| 5 | Multiple reminders, snooze presets, and a primary device | Native plans, task/subtask schedules, Web Push schedules, configurable task presets, ownership cache, and primary demotion are tested; database checks enforce quiet secondary devices. | Physical native actions plus hosted cross-device ownership and Web Push. |
| 6 | Subtasks and optional subtask reminders | Editor, explicit inherited-reminder materialization, domain schedules, completion reconciliation, native payloads, Web Push plans, and browser persistence/ARIA drills provide local evidence. | Physical notification action drill. |
| 7 | Today, priority/time lanes, week/month calendar | `today-screen.tsx`, `planning-calendar.tsx`, and task planning/domain tests implement these views; browser walkthrough covers switching and task placement. | Release-device responsive smoke test. |
| 8 | Browse, copy, create, edit, and delete templates | Template domain/context/screen code and tests cover official/private behavior, search, copy-before-edit, deletion, and date-safe instantiation. | Release-device smoke test. |
| 9 | Focus from a task or reminder | Focus route, native response coordinator, active-tab reminder, Web Push deep link, and widget routes are implemented; payload/route tests pass. | Physical notification/widget and permission-granted Web Push drills. |
| 10 | Check-In mood, label, reflection, reminder, search, trends | Domain validation/tests and Check-In UI implement one daily entry, mood 1-5, one-word label, optional reflection, 7/30-day trends, search, and separate reminders. | Physical/system reminder drill. |
| 11 | Continuous, searchable, offline, safely merged Brain Dump | IndexedDB/SQLite repositories, encrypted Yjs updates, merge tests, single-runtime verifier, and browser editing walkthrough provide local evidence. | Hosted two-client reconnect/compaction-volume validation. |
| 12 | Mobile next-reminder and today widgets | iOS extension configuration, timeline coordinator, deep links, content-free cleanup, timeline tests, and the explicit capability contract in `docs/PLATFORM_SUPPORT.md` exist; Hermes export passes. | Physical iOS rendering and interaction. The selected Expo widget library is iOS-only, so Android widgets are explicitly outside the controlled-beta claim. |
| 13 | Offline after initial sign-in | Local repositories/outbox and auth storage are implemented; production PWA offline sign-in/reload/mutation/reconnect drill passed. | Physical killed-process native drill. |
| 14 | Active-device sync and offline recovery | Encrypted outbox, idempotent mutation RPC, private Broadcast, durable reconciliation, field merge, and two-origin local realtime drill pass. | Hosted latency, missed-event, and network-transition drill. |
| 15 | End-to-end encrypted content inaccessible to backend | AES-256-GCM field envelopes, wrapped web keys, SecureStore native keys, ciphertext-only database inspection, RLS/RPC tests, and documented metadata boundaries provide local evidence. | Independent cryptographic/application review and hosted abuse testing. |
| 16 | Light, dark, system, and manual themes | Theme tokens, system preference, manual override, synchronized settings, contrast checks, and browser walkthrough provide local evidence. | Physical system-theme and dynamic-type smoke test. |
| 17 | Installable offline PWA | Manifest, icons, eight static routes, controlled update activation, Workbox shell, 16 artifact checks, 22 precache URLs, and offline browser drill pass. | Release-browser install and update drill. |
| 18 | Export and one-hour deletion | Readable JSON/Markdown, strict encrypted backup validation against task/Check-In domain invariants, read-only boundary, cancellation UI, scheduled finalizer, 13 live function checks, and cascade tests pass locally. | Hosted finalizer and separate clean-device restore drill. |
| 19 | Accessibility for critical workflows | Semantic roles/states, labels, keyboard focus CSS, reduced-motion handling, AA token contrast, browser keyboard/ARIA walkthrough, and Lighthouse accessibility evidence exist. | VoiceOver, TalkBack, dynamic-type, touch-target, and release-browser walkthroughs. |
| 20 | Critical/high security findings resolved | Security design, local abuse verifiers, dependency audit, and production gates are documented. | External gate: commission the independent review and resolve every critical/high finding. |

## Current Verification Baseline

- Native source targets are pinned to iOS 16.4+ and Android 7+ (API 24) with
  Android compile/target API 36.
- `pnpm verify:platform`: 19 source/generated target, sensitive Android
  manifest, browser-policy, and iOS-only widget-claim checks pass
- `pnpm verify:performance`: Quick Add, recurring completion, Today planning,
  and search pass a 100 ms median budget against 2,000 local tasks on the
  verification host; release-device timing remains a physical gate
- `pnpm test`: 130 tests (43 domain, 6 cryptography, 81 application)
- `pnpm typecheck`: all strict TypeScript packages pass
- `pnpm verify:web-push`: VAPID authorization and encrypted payload pass
- `pnpm verify:supabase`: 54 database, 13 deletion-function, and 15 Web Push
  function checks pass
- `pnpm build:web`: 16 production artifact checks and 22 precache URLs pass
- `pnpm build:native`: iOS and Android Hermes exports pass
- `pnpm audit --prod`: no known production vulnerabilities

## Completion Boundary

All locally executable feature work in this matrix must remain green. The MVP
cannot be called controlled-beta-ready until the connected, physical, and
external gates in this file and `docs/ACCEPTANCE.md` have direct evidence.
