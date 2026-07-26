# MVP Acceptance Traceability

Status audited on 2026-07-26 against `REQUIREMENTS.md` section 19.

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
| 1 | Google, GitHub, or email account creation | Partial | `apps/mobile/src/auth/auth-boundary.tsx`, `apps/mobile/src/auth/auth-context.tsx`, native OAuth callback handling, and local email-code sign-in | Exercise all three methods against the connected deployment |
| 2 | Recovery-key confirmation and trusted-device enrollment | Partial | `apps/mobile/src/security/security-boundary.tsx`, strict native/web stored-identity parsing, an encrypted restore into a separately enrolled clean browser origin, local two-origin approval, and the managed 119-check backend run covering recovery proof, approval, rejection, expiry, revocation, and cross-account denial | Complete malformed/missing-identity and physical-device recovery drills, then repeat against production |
| 3 | Task creation, editing, scheduling, recurrence, completion, and search | Local | `apps/mobile/src/features/tasks`, `packages/domain/src/tasks.ts`, and the 2026-07-24 browser walkthrough | None for local product behavior |
| 4 | One-off, routine, and medication behavior | Local | Task editor/domain invariants, medication dose confirmation, recurrence/grace handling, and browser drills recorded in `docs/ACCEPTANCE.md` | None for local product behavior |
| 5 | Multiple reminders, snooze presets, and primary reminder device | Partial | Owner-serialized native/browser scheduling and cleanup, native/web schedulers, Focus presets, reminder authorization cache, private device RPCs, deployed VAPID/function secrets, managed live-session ownership/revocation checks, and a real managed cron drill that rejected and removed an untrusted synthetic Push endpoint before outbound access | Complete rendered release-browser delivery/cleanup and physical notification/action/snooze drills; repeat against production |
| 6 | Subtasks and optional subtask reminders | Partial | Task editor, domain scheduling plan, independent per-step reminder configuration, and persistence drill | Physical notification delivery and cancellation for parent and subtask schedules |
| 7 | Today, priority/time lanes, and week/month calendars | Local | `apps/mobile/src/features/tasks/today-screen.tsx`, `apps/mobile/src/features/tasks/planning-calendar.tsx`, browser walkthrough, and direct DOM-order evidence that Priority/Time lanes precede Quick Capture | None for local product behavior |
| 8 | Template browse, copy, create, edit, and delete | Local | `apps/mobile/src/features/templates`, `packages/domain/src/templates.ts`, and browser walkthrough | None for local product behavior |
| 9 | Focus mode from a task or reminder | Partial | `apps/mobile/src/features/focus/focus-screen.tsx`, wall-clock task/break timers with foreground reconciliation, task deep links, notification payload routing, and a directly verified safe recovery route for obsolete notification/widget/PWA paths | Open Focus from delivered iOS, Android, and Web Push notifications |
| 10 | Check-In mood, label, reflection, reminder, search, and trends | Partial | `apps/mobile/src/features/check-in`, keyed opaque same-day record IDs with atomic legacy migration, durable save feedback, Check-In repositories/schedulers, and browser walkthrough | Physical reminder delivery and permission behavior |
| 11 | Continuous searchable offline Brain Dump with safe multi-device editing | Partial | `apps/mobile/src/features/brain-dump`, eager local reducer state, serialized remote-operation delivery, revision-aware Yjs retry, restore-safe tombstones, direct keyboard evidence, managed two-session AES-GCM/Yjs checks, and the managed rendered-client drill in `docs/MANAGED_RENDERED_CLIENT_EVIDENCE.md` proving concurrent additions, offline/reconnect convergence, 70-update sustained volume, and competing compaction after 64 third-client updates | Complete physical native keyboard and production drills |
| 12 | Today and Next Reminder mobile widgets | Partial | Owner-scoped serialized iOS/Android widget publishing and cleanup, generated platform registration, WorkManager compatibility alignment across both widget stacks, Hermes exports, snapshot/timeline evidence, and a signed internal Android APK | Physical iOS and Android rendering, resize, rollover, cleanup, and deep-link drills |
| 13 | Offline usability after initial sign-in | Partial | SQLite/IndexedDB repositories, atomic local-record plus encrypted-outbox transactions for all structured user writes, owner-keyed private-provider remounting, fail-closed handling when any saved feature store cannot be read, a signed-in production-PWA offline/reconnect drill, and a clean-client restore drill that retained its task, dark theme, and encrypted-backup capability with Supabase stopped | Physical native process-termination and offline reminder behavior |
| 14 | Active-device sync and offline recovery | Partial | Encrypted transactional outbox, monotonic field timestamps, server-version acknowledgements, hydration/revision guards, private Broadcast, paginated pulls, durable reconciliation, managed two-session evidence, and the managed rendered-client drill proving bidirectional sub-second edits, an isolated offline outbox, first/intermediate/final-page rendering across 2,003 encrypted tasks, 74 ms median rendered search, and a 1,148 ms offline large-cache restart | Repeat the rendered drills against production and the supported release-browser matrix |
| 15 | End-to-end encryption with no backend plaintext | Partial | `packages/crypto/src/record-encryption.ts`, opaque Check-In IDs, account-scoped key vaults, ciphertext-only rows, schema/RLS contracts, managed cross-account/ciphertext inspection, and a real managed egress-rejection drill that removed an unallowlisted Push endpoint before network access | Independent cryptographic/application review, production abuse repeat, and legal validation |
| 16 | Light, dark, system, and manual themes | Local | `apps/mobile/src/theme.ts`, settings patch hydration, browser walkthrough, restored dark-theme reload/offline evidence, and documented AA token contrast | None for local product behavior |
| 17 | Installable PWA with supported offline behavior | Local | Manifest/icons, Workbox configuration, external service-worker bootstrap, 26 artifact/CSP/header checks, 23 precached URLs, update drill, and signed-in offline drill | Release-browser Web Push remains criterion 5 evidence, not an installability blocker |
| 18 | Data export and one-hour account deletion | Partial | `apps/mobile/src/features/account`, readable/encrypted exports, restore validation, a real file-picker restore into a separately enrolled clean browser origin with reload/offline evidence, an authoritative server-time deletion-status RPC that prevents stale offline cache erasure, credential-safe ordered local erasure, local finalizer drills, and the guarded `verify:connected:acceptance:deletion` operator command | Pass the real connected one-hour scheduler drill, repeat restore on a physical release device, and repeat against production |
| 19 | Accessibility checks for critical workflows | Partial | Semantic browser walkthrough, direct fresh-origin production setup/sign-in landmark and H1/H2 hierarchy evidence, direct authenticated-preview checks proving one `main` and one H1 per route plus one labeled primary navigation outside Focus, an authenticated unmatched-route drill proving the shared `main`/navigation, recovery H1, return control, and restored Today H1, accessible root/font startup, main/heading/status semantics for recovery, app-lock, and deletion boundaries, a non-live per-second deletion timer, keyboard/focus checks, target-size audit, reduced motion, uncapped text scaling, and Lighthouse | VoiceOver/TalkBack and dynamic-type walkthroughs on physical devices |
| 20 | Critical/high security findings resolved | Partial | Local security contracts, private database-function execution boundaries, privacy map, exact-hash script CSP, generated host-header/cache policy, live deployment verifier, hardening review, and a live lockfile-bound audit of 609 production dependencies with zero advisories at every severity | Passing header evidence from the selected production host, independent cryptographic/application security review, release-candidate audit repeat, and resolution of every critical/high finding |

## Current Conclusion

The repository is locally runnable. Its product source addresses criteria
1-19 and includes security hardening relevant to criterion 20, but only
criteria 3, 4, 7, 8, 16, and 17 currently have complete local evidence without
an outstanding connected, physical-device, or independent-review dependency.

The unchecked rows in `docs/ACCEPTANCE.md` are the authoritative execution
gates. A row in this matrix must not be promoted from **Partial** or **Pending**
until its corresponding direct evidence is captured there.
