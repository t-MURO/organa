# Organa EAS Web Production Evidence

Status recorded on 2026-07-27.

This file records the selected production HTTPS deployment and live-response
gate. It does not claim release-browser PWA installation, offline restart,
service-worker replacement, permission-granted Web Push, the full scheduled
production-backend drill, physical-device validation, or external review.

## Production Build

The selected stable origin is:

```text
https://organa.expo.app
```

The production EAS environment contains all three required public client
variables. Its value-redacting client preflight passed before export. The
existing local `.env.local` was not replaced; EAS injected the production
environment directly into the build command.

The resulting export passed all 28 web artifact checks:

- eight static routes
- one exact document CSP shared by HTML and route metadata
- nine response-header policies
- one fingerprinted application bundle
- a 23-URL Workbox precache
- explicit service-worker HTTP-cache bypass
- exact agreement between the compiled managed Supabase origin and CSP

The EAS deployment dry run contained only `assets.json`, `manifest.json`, and
`routes.json`. The candidate was promoted with `--prod`, `--environment
production`, and the already verified `dist` directory.

## Live Verification

Both the stable production origin and its immutable deployment origin pass all
17 checks from:

```sh
pnpm verify:web-deployment -- https://organa.expo.app
```

Direct evidence covers exact CSP parity, clickjacking protection, HSTS, MIME,
referrer, opener/resource, capability, shell/worker cache, fingerprinted
bundle, managed-backend, and service-worker update policies. Both origins
serve the same fingerprinted application bundle.

The final clean source commit, immutable deployment identifier, archive
checksum, and exact verification references are kept in the ignored,
mode-600 `.organa-release-evidence.json`. This checked-in record intentionally
does not duplicate private release-manifest fields.

## Remaining Gates

- Exercise install, offline restart, service-worker replacement, and
  permission-granted Web Push in every supported release browser.
- Complete one Maileroo-delivered code sign-in at the stable production
  origin; the production Site URL and exact redirect policy are configured.
- Complete the full scheduled connected drill, physical-device matrix,
  independent security review, legal review, signing, and store evidence.

No tests were added, changed, or run for this milestone.
