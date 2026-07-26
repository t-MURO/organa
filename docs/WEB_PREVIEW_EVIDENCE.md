# Organa EAS Web Preview Evidence

Status recorded on 2026-07-26.

This file records connected-test web evidence. It does not claim production
promotion, a custom domain, provider acceptance, release-browser PWA or Web
Push behavior, independent security review, or legal approval.

## Deployment Identity

| Field | Value |
| --- | --- |
| EAS project | `@t-muro/organa` |
| EAS project ID | `ae92cff5-050e-4972-808d-a393be8d67e3` |
| Source commit | `d8d46fe40834a0ae3a0475c2010a2a61a87b8e26` |
| EAS environment | `preview` |
| Deployment ID | `qx4eh5f2zq` |
| Immutable URL | `https://organa--qx4eh5f2zq.expo.app` |
| Stable alias | `https://organa--preview.expo.app` |
| Fingerprinted bundle | `entry-e30549a6478d0bbd6d2d325103d54781.js` |

The clean source commit was pushed before deployment. The deployment command
used the locally verified `apps/mobile/dist` export, disabled deployment source
maps, and assigned the `preview` alias.

## Artifact Checks

`pnpm build:web` passed 27 production artifact checks:

- eight statically rendered routes
- one exact document CSP shared by HTML, Expo route metadata, and `_headers`
- nine global route response headers in `_expo/.routes.json`
- one fingerprinted application bundle
- a 23-URL Workbox precache
- an external registration bootstrap with `updateViaCache: "none"`

The EAS deployment dry run produced only `assets.json`, `manifest.json`, and
`routes.json`. Its private-file scan passed, and the transformed route manifest
retained all nine expected header names with no redirects.

## Live Response Checks

Both of these commands pass all 16 checks:

```sh
pnpm verify:web-deployment -- https://organa--preview.expo.app
pnpm verify:web-deployment -- https://organa--qx4eh5f2zq.expo.app
```

Direct live evidence covers:

- exact CSP parity between the document and response, including
  `frame-ancestors 'none'`
- same-origin scripts plus only the exact Expo hydration hash
- only the paired managed Supabase HTTPS and WebSocket origins
- MIME, opener, resource, permission, referrer, and transport protection
- shell revalidation with `no-cache`, `no-store`, and `must-revalidate`
- a content-addressed application bundle
- bounded EAS static-asset caching at one hour
- service-worker and imported-worker update checks that bypass the HTTP cache

[Expo Router server headers](https://docs.expo.dev/router/web/server-headers/)
are encoded into `_expo/.routes.json` for EAS Hosting. EAS documents that it
converts `X-Frame-Options` into CSP protection in its
[default response behavior](https://docs.expo.dev/eas/hosting/reference/responses-and-headers/),
so the live response omits the legacy header while retaining the verifier's
exact response-level `frame-ancestors` requirement. EAS also documents a
default one-hour browser cache for static assets in its
[caching reference](https://docs.expo.dev/eas/hosting/reference/caching/).

The live verifier accepts the bounded cache profile only for `*.expo.app` and
only when the deployed registration bootstrap contains
`updateViaCache: "none"`. Every other host still has to provide the stricter
mutable revalidation and immutable fingerprinted-asset policies generated in
`dist/_headers`.

## Managed Auth Callback

The managed Supabase test project now uses the stable alias as its Site URL.
Its exact redirect allowlist is:

```text
https://organa--preview.expo.app/**
organa://**
http://localhost:8081/**
http://localhost:4173/**
```

The guarded provisioning command and its immediate read-only repeat both
passed. The previous immutable preview URL was removed instead of retained as
a stale redirect.

## Remaining Gates

- Promote a reviewed export through the `production` EAS environment and run
  the same live verifier against the production origin.
- Exercise install, offline restart, service-worker replacement, and
  permission-granted Web Push in every supported release browser.
- Configure and exercise Google, GitHub, and custom-SMTP email codes.
- Complete the connected production repeat, physical-device matrix,
  independent security review, legal review, signing, and store evidence.

No tests were added, changed, or run for this milestone.
