# Organa

Organa is a calm, offline-first productivity app designed for people with ADHD.

The first implementation slice includes:

- Expo application targeting iOS, Android, and web
- Responsive Today screen with priority and time lanes
- Quick Add plus full task creation and editing
- One-off, routine, and medication task configuration
- Scheduling, due dates, recurrence, reminders, snooze presets, and grace days
- Independent subtasks, checkbox-only completion, undo, and confirmed deletion
- SQLite persistence on native platforms
- IndexedDB persistence on web
- Light, dark, and system theme modes
- Shared task domain with tested planning rules
- Continuous Brain Dump with automatic bullet entry and local search
- Offline Brain Dump persistence through SQLite and IndexedDB
- Pressure-free daily Check-In with mood, feeling, and reflection
- Local Check-In search with 7-day and 30-day mood views
- Offline Check-In persistence through SQLite and IndexedDB

See [REQUIREMENTS.md](./REQUIREMENTS.md) for the complete product requirements.

## Development

Requirements:

- Node.js
- pnpm 10

Install and run the web app:

```sh
pnpm install
pnpm dev:web
```

Run iOS or Android:

```sh
pnpm --filter @organa/app ios
pnpm --filter @organa/app android
```

## Verification

```sh
pnpm test
pnpm typecheck
pnpm build:web
pnpm dlx expo-doctor@latest apps/mobile
```

## Workspace

```text
apps/mobile/       Expo app for iOS, Android, and web
packages/domain/   Shared task and planning rules
```

Supabase authentication, encrypted synchronization, reminders, Check-In
reminder settings, and conflict-free Brain Dump synchronization are planned but
not yet implemented.
