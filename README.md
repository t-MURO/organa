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
- Google, Apple, GitHub, and email-code authentication
- Recovery key onboarding, trusted reminder devices, local app lock, export,
  and one-hour account deletion
- Native local notifications plus Web Push and active-tab web fallback
- iOS widgets for today's tasks and the next reminder
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
cp .env.example .env.local
pnpm dev:web
```

Without Supabase environment values, development builds offer an explicitly
local preview. Production builds always require an account.

Run native development builds:

```sh
pnpm --filter @organa/app ios
pnpm --filter @organa/app android
```

Expo widgets and some native modules require a development build rather than
Expo Go.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm verify:platform
pnpm verify:performance
pnpm verify:yjs-runtime
pnpm verify:web-push
pnpm build:native
pnpm build:web
pnpm dlx expo-doctor@latest apps/mobile
pnpm audit --prod
```

Backend verification additionally requires Docker:

```sh
pnpm dlx supabase start
pnpm dlx supabase db reset
pnpm dlx supabase db lint --local --level warning
pnpm verify:supabase
```

See [supabase/README.md](./supabase/README.md) for production setup,
[docs/PLATFORM_SUPPORT.md](./docs/PLATFORM_SUPPORT.md) for the release
compatibility contract, and [docs/ACCEPTANCE.md](./docs/ACCEPTANCE.md) for the
controlled-beta checklist. The requirement-by-requirement evidence map is in
[docs/REQUIREMENTS_TRACEABILITY.md](./docs/REQUIREMENTS_TRACEABILITY.md).

## Security

Read [docs/SECURITY.md](./docs/SECURITY.md) before connecting real user data.
An independent cryptographic and application security review is a mandatory
production gate; repository tests are not a substitute for that review.
