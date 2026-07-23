# Organa

Organa is a calm, offline-first productivity app designed for people with ADHD.

The first implementation slice includes:

- Expo application targeting iOS, Android, and web
- Responsive Today screen with priority and time lanes
- Quick Add plus full task creation and editing
- One-off, routine, and medication task configuration
- Scheduling, due dates, recurrence, reminders, snooze presets, and grace days
- Independent subtasks, checkbox-only completion, undo, and confirmed deletion
- Week-first calendar planning with a month toggle and selectable day plans
- Searchable upcoming, overdue, and completed task inbox
- Calendar-aware recurring occurrences with preserved completion history
- SQLite persistence on native platforms
- IndexedDB persistence on web
- Light, dark, and system theme modes
- Shared task domain with tested planning rules
- Continuous Brain Dump with automatic bullet entry and local search
- Offline Brain Dump persistence through SQLite and IndexedDB
- Pressure-free daily Check-In with mood, feeling, and reflection
- Local Check-In search with 7-day and 30-day mood views
- Offline Check-In persistence through SQLite and IndexedDB
- Searchable official and private task-template library
- Private template creation, copying, editing, deletion, and offline persistence
- Single-task Focus mode with optional timer, reset, break, and direct task entry
- Offline iOS and Android reminders with before, due, and after stages
- Task-specific notification actions for Focus and configurable snooze presets
- Explicit in-app-only reminder fallback on web

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

Supabase authentication, encrypted synchronization, Check-In reminder settings,
widgets, and conflict-free Brain Dump synchronization are planned but not yet
implemented.
