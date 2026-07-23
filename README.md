# Organa

Organa is a calm, offline-first productivity app designed for people with ADHD.

The first implementation slice includes:

- Expo application targeting iOS, Android, and web
- Responsive Today screen with priority and time lanes
- Quick Add and task completion
- SQLite persistence on native platforms
- IndexedDB persistence on web
- Light, dark, and system theme modes
- Shared task domain with tested planning rules
- Check-In and Brain Dump route foundations

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

Supabase authentication, encrypted synchronization, reminders, and the complete
Check-In and Brain Dump experiences are planned but not yet implemented.
