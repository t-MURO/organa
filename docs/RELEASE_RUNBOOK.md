# Controlled-Beta Release Runbook

Status updated on 2026-07-26.

This runbook turns a reviewed Organa commit into reproducible preview and
store artifacts. It does not replace the connected-backend, physical-device,
security, legal, or store review gates in `docs/ACCEPTANCE.md`.
The engineering disclosure inventory and unresolved declaration decisions are
in `docs/PRIVACY_DATA_MAP.md`.
Connected functional testing currently uses the managed path in
`docs/MANAGED_SUPABASE_TESTING.md`. Production artifacts require the reviewed
managed release backend and every gate in this runbook.

## Release Boundaries

- Run EAS commands from `apps/mobile`, the Expo application root.
- `preview` creates an internally distributed iOS build and an installable
  Android APK for physical-device acceptance checks.
- `preview-simulator` compiles a standalone iOS Simulator `.app` with the
  preview environment and without an Apple Developer account. It is a native
  compilation check, not physical-device or signing evidence.
- `production` creates store-distribution artifacts and increments the remote
  iOS build number or Android version code.
- EAS refuses to build from an uncommitted worktree.
- Native application updates use the App Store and Google Play. Do not publish
  an EAS Update for the controlled beta.
- Web/PWA deployment remains a separate immutable production export.

## One-Time Project Setup

The current source is linked to `@t-muro/organa`, EAS project
`ae92cff5-050e-4972-808d-a393be8d67e3`. Steps 1-4 below are complete for this
release line; repeat the live `project:info` check before recording candidate
evidence.

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
npx eas-cli@21.2.0 env:exec preview \
  "pnpm verify:release:client-config"
npx eas-cli@21.2.0 env:exec production \
  "pnpm verify:release:client-config"
```

EAS also runs the same dependency-free validator automatically through the
`eas-build-pre-install` lifecycle hook. A missing or malformed value stops the
job before dependency installation, and validation output names fields without
printing their values. Local development exports intentionally remain
available without these values so the setup-required boundary can be checked.

Before requesting physical iOS signing, compile the generated iOS app and both
widget targets with the standalone simulator profile:

```sh
cd apps/mobile
npx eas-cli@21.2.0 build \
  --platform ios \
  --profile preview-simulator \
  --non-interactive
```

This profile deliberately reuses the preview environment. A successful
simulator artifact does not satisfy notification, widget interaction,
VoiceOver, dynamic-type, offline-process, or physical-device rows.

Organa implements AES-256-GCM rather than relying only on transport security.
Do not add `ios.config.usesNonExemptEncryption` merely to silence an EAS
warning. Complete Apple's App Store Connect encryption questionnaire and the
legal/export review first. Set the Info.plist declaration only from that
recorded determination, and attach any required compliance code or
documentation before TestFlight or App Store submission.

Confirm that both Supabase values point to the selected EU project. Confirm
that hosted Auth allows the exact web origins and the `organa://**` native
callback. Keep Google and GitHub disabled in Supabase and in the client for
the controlled beta. Their credentials and provider-console setup belong to a
separate post-beta rollout. The app rejects non-HTTPS remote endpoints, URL
credentials, placeholders, and any key that is not an `sb_publishable_`
client key; do not weaken that runtime boundary to make a build appear
configured.
The Web Push function must also have a reviewed `WEB_PUSH_ALLOWED_HOSTS` list
containing only the exact or explicit `*.` Push-service hosts observed in
supported release browsers.

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

## Readiness Gate

The final readiness check consumes only local, non-secret evidence references;
it does not contact EAS, stores, reviewers, browsers, devices, or the backend
on the operator's behalf. From a clean commit, initialize the ignored private
manifest:

```sh
pnpm initialize:release:evidence
```

The initializer refuses to overwrite an existing manifest, creates it with
mode 600, and fills only the clean source commit and checked-in EAS project
link. Replace every remaining placeholder only after the corresponding direct
production evidence exists. The manifest is ignored by Git. Do not put
provider credentials, tokens, sessions, device proofs, encryption material,
or user content in it.
The v2 backend identity records managed deployments by project ref and applied
migration version. Other deployment types are rejected.

Run all connected backend phases into one commit-bound evidence file:

```sh
pnpm configure:connected:drill-consent -- --web-push enabled --one-hour-deletion enabled
pnpm verify:connected:acceptance:full
pnpm configure:connected:drill-consent -- --web-push disabled --one-hour-deletion disabled
```

Backend-only evidence may be gathered independently, but its distinct scope
and phase name cannot satisfy this release command. The full scope confirms
the controlled-beta email-only Auth policy. Each destructive consent is
explicit and per-run; the configuration command changes only those booleans
through an atomic, mode-preserving replacement and never prints credentials.

After every source, connected, physical-device, browser, artifact, audit, and
review gate is complete, run:

```sh
pnpm verify:release:readiness
```

The command requires a clean current commit, its matching three-phase
connected evidence, a real EAS project link, and a strict production manifest.
The manifest also binds the complete source-gate output to the candidate. The
command reports every ready or blocked evidence group and exits nonzero until
none remain. Passing this structural preflight does not replace review of the
referenced evidence.

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

The export includes `dist/_headers`, generated from the exact rendered CSP.
Netlify- and Cloudflare-compatible hosts can consume that file directly.
Other hosts must map every rule to equivalent response-header configuration;
do not serve `_headers` as evidence that the rules were applied.
Expo Router also writes the same document policy to `_expo/.routes.json`.
EAS Hosting consumes that route metadata for HTML responses. Its static assets
use a documented bounded one-hour cache, so Organa registers the worker with
`updateViaCache: "none"` to bypass HTTP caches for worker and imported-worker
update checks.

After deployment, verify the real HTTPS responses:

```sh
pnpm verify:web-deployment -- https://your-organa-web-origin.example
```

The command checks CSP/clickjacking policy, MIME and capability restrictions,
HSTS, cross-origin/referrer policy, shell/worker caching, and fingerprinted
bundles. Non-EAS hosts must apply the strict mutable and immutable cache
policy. On `*.expo.app`, the verifier instead requires EAS's exact bounded
cache profile plus the deployed worker-update bypass. Keep its output with the
web artifact and browser evidence.

Do not commit the generated `.env` file. Record the deployment identifier,
artifact checksum, header-verifier output, exact browser versions, PWA install
result, offline result, service-worker update drill, and permission-granted
Web Push evidence.

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
| Backend | EU managed origin, project ref, and migration version |
| Review | Security, legal, privacy, and store-review status |
| Privacy | Reviewed data-map revision, policy URL, and store declaration exports |
| Devices | Model, OS version, and completed physical checks |
| Browsers | Browser/version and completed PWA/Web Push checks |

Keep failed or superseded candidates in the release log. Never reuse their
evidence for a later commit.
