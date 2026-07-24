# Controlled-Beta Release Runbook

Status prepared on 2026-07-24.

This runbook turns a reviewed Organa commit into reproducible preview and
store artifacts. It does not replace the connected-backend, physical-device,
security, legal, or store review gates in `docs/ACCEPTANCE.md`.

## Release Boundaries

- Run EAS commands from `apps/mobile`, the Expo application root.
- `preview` creates an internally distributed iOS build and an installable
  Android APK for physical-device acceptance checks.
- `production` creates store-distribution artifacts and increments the remote
  iOS build number or Android version code.
- EAS refuses to build from an uncommitted worktree.
- Native application updates use the App Store and Google Play. Do not publish
  an EAS Update for the controlled beta.
- Web/PWA deployment remains a separate immutable production export.

## One-Time Project Setup

1. Create or select the Organa EAS project under the organization that will
   own the release.
2. From `apps/mobile`, run:

   ```sh
   npx eas-cli@21.2.0 init
   ```

3. Review the generated `extra.eas.projectId` in `app.json`. It is an opaque
   Expo-owned identifier: do not invent, derive, or copy one from another app.
4. Commit the linked project identifier before creating a build.
5. Configure iOS and Android signing credentials in the owning EAS account.
   Confirm that the iOS App Group used by the widgets is provisioned.
6. Create the App Store Connect and Google Play application records for:

   ```text
   iOS bundle ID: app.organa.mobile
   Android package: app.organa.mobile
   iOS widget bundle ID: app.organa.mobile.widgets
   iOS App Group: group.app.organa.mobile
   ```

## Environment Contract

Create these EAS variables separately in both `preview` and `production`:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
```

These values are embedded in client bundles and must be treated as public
identifiers, not secrets. Service-role keys, VAPID private keys, signing keys,
and provider secrets must never use an `EXPO_PUBLIC_` variable or enter the
client source.

Before each build, inspect the selected environment:

```sh
npx eas-cli@21.2.0 env:list --environment preview
npx eas-cli@21.2.0 env:list --environment production
```

Confirm that both Supabase values point to the selected EU project. Confirm
that hosted Auth allows the exact web origins and the `organa://**` native
callback. Configure Google, Apple, and GitHub secrets only in Supabase and
their provider consoles.

## Source Gate

Start from a clean, reviewed commit:

```sh
git status --short
pnpm typecheck
pnpm build:web
pnpm build:native
pnpm audit --prod
```

The test suite remains a required release gate in `docs/ACCEPTANCE.md`, but it
is intentionally not included in this implementation checkpoint while test
work is paused.

Record the commit SHA, Expo SDK, React Native version, dependency-audit result,
and web/native build output in the release evidence.

## Preview Builds

Create physical-device artifacts from the same commit:

```sh
cd apps/mobile
npx eas-cli@21.2.0 build --platform all --profile preview
```

Register intended iOS test devices before the build when internal
distribution uses ad hoc provisioning. Install the Android APK directly on
the oldest and current supported Android versions.

Run every physical-device check in `docs/ACCEPTANCE.md` and
`docs/PLATFORM_SUPPORT.md`. Do not promote a commit whose notification,
offline, app-lock, widget, screen-reader, dynamic-type, sound, or haptic gate
is incomplete.

## Store Builds

After preview evidence, external review, legal review, and hosted validation
are complete:

```sh
cd apps/mobile
npx eas-cli@21.2.0 build --platform all --profile production
```

Record both EAS build IDs and artifact checksums. Confirm that the artifacts
were built from the reviewed commit and the `production` EAS environment.

## Submission

Upload iOS to App Store Connect:

```sh
npx eas-cli@21.2.0 submit --platform ios --profile production --latest
```

Assign the build to the intended TestFlight group only after export
compliance, privacy declarations, reviewer notes, and medication-language
review are complete.

Upload Android to the internal track as a draft:

```sh
npx eas-cli@21.2.0 submit --platform android --profile production --latest
```

Google Play requires the first application upload to be completed manually.
Review the draft release, Data safety form, content declarations, tester list,
and country availability before publishing it to internal testers.

## Web/PWA Release

Export the web app with the production EAS environment loaded locally, then
deploy the exact immutable `apps/mobile/dist` output to the selected HTTPS
host:

```sh
cd apps/mobile
npx eas-cli@21.2.0 env:pull --environment production
pnpm build:web
```

Do not commit the generated `.env` file. Record the deployment identifier,
artifact checksum, exact browser versions, PWA install result, offline result,
service-worker update drill, and permission-granted Web Push evidence.

## Evidence Record

Every candidate must record:

| Evidence | Required value |
| --- | --- |
| Git commit | Full immutable SHA |
| EAS project | Owning account and opaque project ID |
| EAS environment | `preview` or `production` |
| iOS build | Build ID, build number, artifact checksum |
| Android build | Build ID, version code, artifact checksum |
| Web deployment | Immutable deployment ID and artifact checksum |
| Backend | EU project reference and migration revision |
| Review | Security, legal, privacy, and store-review status |
| Devices | Model, OS version, and completed physical checks |
| Browsers | Browser/version and completed PWA/Web Push checks |

Keep failed or superseded candidates in the release log. Never reuse their
evidence for a later commit.
