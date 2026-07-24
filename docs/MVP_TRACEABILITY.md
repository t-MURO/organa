# MVP Acceptance Traceability

Status audited on 2026-07-25 against `REQUIREMENTS.md` section 19.

This matrix separates implementation evidence from the external evidence
required to declare the controlled-beta MVP complete.

Status meanings:

- **Local**: the criterion has direct source, build, or local runtime evidence.
- **Partial**: substantial implementation exists, but required connected or
  physical-device evidence is still missing.
- **Pending**: no acceptable substitute exists for the outstanding external
  gate.

| # | Acceptance criterion | Status | Current evidence | Evidence still required |
| --- | --- | --- | --- | --- |
| 1 | Google, Apple, GitHub, or email account creation | Partial | `apps/mobile/src/auth/auth-boundary.tsx`, `apps/mobile/src/auth/auth-context.tsx`, native OAuth callback handling, and local email-code sign-in | Exercise all four providers against the connected deployment |
| 2 | Recovery-key confirmation and trusted-device enrollment | Partial | `apps/mobile/src/security/security-boundary.tsx`, strict native/web stored-identity parsing, a connected untrusted-device erasure/recovery-boundary drill, encrypted restore into a separately enrolled clean browser origin, `packages/crypto/src/recovery-key.ts`, `packages/crypto/src/device-approval.ts`, and the local two-origin approval drill | Repeat enrollment, approval, rejection, expiry, malformed/missing identity, and physical-device recovery on home-server and production clients |
| 3 | Task creation, editing, scheduling, recurrence, completion, and search | Local | `apps/mobile/src/features/tasks`, `packages/domain/src/tasks.ts`, and the 2026-07-24 browser walkthrough | None for local product behavior |
| 4 | One-off, routine, and medication behavior | Local | Task editor/domain invariants, medication dose confirmation, recurrence/grace handling, and browser drills recorded in `docs/ACCEPTANCE.md` | None for local product behavior |
| 5 | Multiple reminders, snooze presets, and primary reminder device | Partial | Native/web schedulers, Focus presets, reminder authorization cache, private device RPCs, local Supabase checks, and guarded connected live-session/Web Push scheduler verifiers | Pass connected ownership/revocation, Web Push cron, rendered-client cleanup, and physical notification/action/snooze delivery drills |
| 6 | Subtasks and optional subtask reminders | Partial | Task editor, domain scheduling plan, independent per-step reminder configuration, and persistence drill | Physical notification delivery and cancellation for parent and subtask schedules |
| 7 | Today, priority/time lanes, and week/month calendars | Local | `apps/mobile/src/features/tasks/today-screen.tsx`, `apps/mobile/src/features/tasks/planning-calendar.tsx`, and browser walkthrough | None for local product behavior |
| 8 | Template browse, copy, create, edit, and delete | Local | `apps/mobile/src/features/templates`, `packages/domain/src/templates.ts`, and browser walkthrough | None for local product behavior |
| 9 | Focus mode from a task or reminder | Partial | `apps/mobile/src/features/focus/focus-screen.tsx`, task deep links, and notification payload routing | Open Focus from delivered iOS, Android, and Web Push notifications |
| 10 | Check-In mood, label, reflection, reminder, search, and trends | Partial | `apps/mobile/src/features/check-in`, Check-In repositories/schedulers, and browser walkthrough | Physical reminder delivery and permission behavior |
| 11 | Continuous searchable offline Brain Dump with safe multi-device editing | Partial | `apps/mobile/src/features/brain-dump`, direct one-Enter/one-new-bullet browser evidence, platform-separated submit handling, and a 75-check local backend phase that uses two sessions/device proofs with client-format AES-GCM Yjs deltas to prove durable recovery, order-independent convergence, exact-set compaction, and delete-versus-update cleanup | Run the prepared phase on the home server, then complete rendered two-client offline/reconnect, sustained-volume/concurrent-compaction, physical native keyboard, and production drills |
| 12 | Today and Next Reminder mobile widgets | Partial | iOS/Android widget implementations, generated platform registration, Hermes exports, and snapshot/timeline evidence | Physical iOS and Android rendering, resize, rollover, cleanup, and deep-link drills |
| 13 | Offline usability after initial sign-in | Partial | SQLite/IndexedDB repositories, atomic local-record plus encrypted-outbox transactions for all structured user writes, a signed-in production-PWA offline/reconnect drill, and a clean-client restore drill that retained its task, dark theme, and encrypted-backup capability with Supabase stopped | Physical native process-termination and offline reminder behavior |
| 14 | Active-device sync and offline recovery | Partial | Encrypted transactional outbox, strictly monotonic serialized client field timestamps, ordered and locally acknowledged remote delivery, pending-record hydration guards, acknowledgement repulls, private Broadcast, paginated pulls, durable reconciliation, and local two-origin sync | Measure connected two-client latency and missed-broadcast/offline recovery |
| 15 | End-to-end encryption with no backend plaintext | Partial | `packages/crypto/src/record-encryption.ts`, account-scoped key vaults, ciphertext-only local Supabase rows, schema/RLS contracts, and fail-closed Web Push egress hosts | Connected-deployment ciphertext/egress inspection and independent security review |
| 16 | Light, dark, system, and manual themes | Local | `apps/mobile/src/theme.ts`, settings patch hydration, browser walkthrough, restored dark-theme reload/offline evidence, and documented AA token contrast | None for local product behavior |
| 17 | Installable PWA with supported offline behavior | Local | Manifest/icons, Workbox configuration, 18 artifact checks, update drill, and signed-in offline drill | Release-browser Web Push remains criterion 5 evidence, not an installability blocker |
| 18 | Data export and one-hour account deletion | Partial | `apps/mobile/src/features/account`, readable/encrypted exports, restore validation, a real file-picker restore into a separately enrolled clean browser origin with reload/offline evidence, an authoritative server-time deletion-status RPC that prevents stale offline cache erasure, local finalizer drills, and the guarded `verify:connected:acceptance:deletion` operator command | Pass the real connected one-hour scheduler drill, repeat restore on a physical release device, and repeat against production |
| 19 | Accessibility checks for critical workflows | Partial | Semantic browser walkthrough, keyboard/focus checks, target-size audit, reduced motion, uncapped text scaling, and Lighthouse | VoiceOver/TalkBack and dynamic-type walkthroughs on physical devices |
| 20 | Critical/high security findings resolved | Pending | Local security contracts, dependency audit, privacy map, and hardening review are preparation only | Independent security review and resolution of every critical/high finding |

## Current Conclusion

The repository is locally runnable. Its product source addresses criteria
1-19 and includes security hardening relevant to criterion 20, but only
criteria 3, 4, 7, 8, 16, and 17 currently have complete local evidence without
an outstanding connected, physical-device, or independent-review dependency.

The unchecked rows in `docs/ACCEPTANCE.md` are the authoritative execution
gates. A row in this matrix must not be promoted from **Partial** or **Pending**
until its corresponding direct evidence is captured there.
