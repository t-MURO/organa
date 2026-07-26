# Organa Development Workflow

Use the smallest verification lane that matches the behavior changed. Release
evidence is a snapshot of a selected candidate, not a continuously updated
record for every commit.

## UI-Only Lane

Use this lane for:

- layout, spacing, typography, colors, and themes
- copy and labels
- animation and visual feedback
- responsive breakpoints
- presentational component structure
- accessibility markup that does not change stored or remote behavior

During iteration:

```sh
pnpm dev:web
```

Before committing:

```sh
pnpm verify:ui
```

Also inspect only the affected desktop and phone viewport. Do not run
connected Supabase verification, production deployment, native exports,
dependency audits, release readiness, or release-evidence updates for a
UI-only change.

## Targeted Engineering Lane

Escalate from the UI-only lane only when the change touches the corresponding
boundary:

| Changed boundary | Additional verification |
| --- | --- |
| Domain or local application behavior | `pnpm typecheck` and the relevant focused verifier |
| Native configuration, widgets, permissions, or notification wiring | `pnpm verify:platform` and the affected native export |
| Authentication, recovery, encryption, or protected storage | `pnpm verify:security` |
| Supabase migrations, RLS, RPCs, Realtime, or Edge Functions | `pnpm verify:supabase` and managed verification only when remote behavior changed |
| Dependencies | `pnpm audit --prod` |

Do not broaden a targeted change into the complete release workflow merely
because release tooling exists.

## Release Candidate Lane

Use `docs/RELEASE_RUNBOOK.md` only after explicitly selecting a commit for a
beta or store release. That lane owns:

- full connected backend evidence
- scheduled Web Push and deletion drills
- native release artifacts
- physical-device and release-browser matrices
- production deployment and exact artifact binding
- dependency, legal, privacy, store, and independent security evidence

Release evidence may become stale during normal development. Refresh it once
for the next selected candidate.

## Current Test Policy

Test work is paused. Do not add, modify, or run tests unless explicitly
requested. Existing non-test typechecks, builds, static verifiers, and focused
manual checks remain available through the lanes above.
