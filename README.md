# Organa

Organa is a calm, offline-first organizer for people with ADHD. The MVP targets
iOS, Android, responsive web, and installable PWA from one Expo codebase.

## MVP Features

- One-off, routine, and medication tasks
- Priority and scheduled-time lanes with week/month planning
- Due dates, recurrence, subtasks, multiple reminder stages, snooze, and grace
  days
- Checkbox-only completion, a five-second fade, and immediate Undo
- Searchable upcoming, overdue, completed, and recurring-task history
- Official and private task templates
- Single-task Focus mode with an optional timer and break
- Optional daily Check-In with mood, reflection, reminder time, search, and
  7/30-day trends
- Continuous, searchable Brain Dump with Yjs conflict-free updates
- SQLite persistence on native and IndexedDB persistence on web
- Encrypted outbox sync, field-level merge, private Realtime broadcasts, and
  seven-day encrypted record history
- Google, GitHub, and email-code authentication
- Recovery key onboarding, trusted reminder devices, local app lock, export,
  and one-hour account deletion
- Native local notifications plus Web Push and active-tab web fallback
- iOS and Android widgets for today's tasks and the next reminder
- Light, dark, and system themes, reduced motion, optional sounds, and haptics
- Static PWA export with an app manifest and Workbox offline shell

The full product contract is in [REQUIREMENTS.md](./REQUIREMENTS.md).

## Architecture

```text
apps/mobile/       Expo Router app for iOS, Android, and web
packages/domain/   Platform-independent entities and planning rules
packages/crypto/   AES-256-GCM record and recovery-key envelopes
supabase/          Database migrations and scheduled Edge Functions
docs/              Security, compatibility, and acceptance gates
```

User content is stored locally first. Connected accounts encrypt changed fields
before placing mutations in the outbox. PostgreSQL is the durable encrypted
authority, while private Realtime Broadcast messages are only change signals.

## Development

Requirements:

- Node.js 22 or newer
- pnpm 10
- Xcode for iOS development builds
- Android Studio for Android development builds
- Docker Desktop for the local Supabase stack

```sh
pnpm install
cp .env.example apps/mobile/.env.local
pnpm dev:web
```

Development builds always offer `Continue locally` on the sign-in screen, even
when Supabase is configured. Enter any test email to open a local-only account
without sending a message. Local accounts persist across reloads, each email has
separate data, and no content is synchronized to Supabase. Production builds
never expose local sign-in and always require a connected account.

Run native development builds:

```sh
pnpm --filter @organa/app ios
pnpm --filter @organa/app android
```

Expo widgets and some native modules require a development build rather than
Expo Go.

## Verification

For ordinary layout, styling, copy, animation, and presentational component
changes, run only:

```sh
pnpm verify:ui
```

This typechecks the app and verifies a local production web export. It does
not contact Supabase, deploy production, build native artifacts, run the test
suite, update release evidence, or require acceptance-document changes.

Use only the verification lane that matches the change:

- UI-only: `pnpm verify:ui` plus a visual check of the affected viewport.
- Domain, persistence, authentication, synchronization, encryption,
  reminders, native configuration, or Supabase: run the relevant targeted
  verifier documented in `docs/DEVELOPMENT_WORKFLOW.md`.
- Release candidate: run the complete `docs/RELEASE_RUNBOOK.md` gate once for
  the selected candidate, not after every development commit.

See [supabase/README.md](./supabase/README.md) for production setup,
[docs/DEVELOPMENT_WORKFLOW.md](./docs/DEVELOPMENT_WORKFLOW.md) for the
lightweight change lanes,
[docs/MANAGED_SUPABASE_TESTING.md](./docs/MANAGED_SUPABASE_TESTING.md) for
the current managed production backend,
[docs/PLATFORM_SUPPORT.md](./docs/PLATFORM_SUPPORT.md) for the release
compatibility contract, and [docs/ACCEPTANCE.md](./docs/ACCEPTANCE.md) for the
controlled-beta checklist. The requirement-by-requirement evidence map is in
[docs/REQUIREMENTS_TRACEABILITY.md](./docs/REQUIREMENTS_TRACEABILITY.md).
Artifact profiles, signing handoff, physical checks, and store submission are
defined in [docs/RELEASE_RUNBOOK.md](./docs/RELEASE_RUNBOOK.md).
The exact local/cloud data inventory and store-declaration draft are in
[docs/PRIVACY_DATA_MAP.md](./docs/PRIVACY_DATA_MAP.md).

## Security

Read [docs/SECURITY.md](./docs/SECURITY.md) before connecting real user data.
An independent cryptographic and application security review is a mandatory
production gate, not a prerequisite for routine UI iteration. Repository
tests are not a substitute for that review.
