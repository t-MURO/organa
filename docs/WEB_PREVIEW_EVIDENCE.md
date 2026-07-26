# Organa EAS Web Preview Evidence

Status recorded on 2026-07-26.

This file records connected-test web evidence. It does not claim a reviewed
production candidate, custom domain, provider acceptance, release-browser PWA
or Web Push behavior, independent security review, or legal approval.

## Deployment Identity

| Field | Value |
| --- | --- |
| EAS project | `@t-muro/organa` |
| EAS project ID | `ae92cff5-050e-4972-808d-a393be8d67e3` |
| Source commit | `73d367e5cf025610f333ebac80b3670a7632339a` |
| EAS environment | `preview` |
| Deployment ID | `utbk3m0udl` |
| Immutable URL | `https://organa--utbk3m0udl.expo.app` |
| Stable alias | `https://organa--preview.expo.app` |
| Fingerprinted bundle | `entry-abbea49625c3788eb726e5548ef699f2.js` |

The clean source commit was pushed before deployment. The deployment command
used a cache-cleared export built under the EAS `preview` environment and
assigned the `preview` alias. An earlier invocation also assigned the same
preview-environment artifact to EAS's default domain. That domain is not
treated as production evidence and must be replaced by a reviewed
production-environment candidate before release.

## Artifact Checks

`pnpm build:web` passed 28 production artifact checks:

- eight statically rendered routes
- one exact document CSP shared by HTML, Expo route metadata, and `_headers`
- nine global route response headers in `_expo/.routes.json`
- one fingerprinted application bundle
- a 23-URL Workbox precache
- an external registration bootstrap with `updateViaCache: "none"`
- exact agreement between the managed Supabase origin compiled into the
  application bundle and the origin allowed by CSP

The EAS deployment dry run produced only `assets.json`, `manifest.json`, and
`routes.json`. Its private-file scan passed, and the transformed route manifest
retained all nine expected header names with no redirects.

## Live Response Checks

Both of these commands pass all 17 checks:

```sh
pnpm verify:web-deployment -- https://organa--preview.expo.app
pnpm verify:web-deployment -- https://organa--utbk3m0udl.expo.app
```

Direct live evidence covers:

- exact CSP parity between the document and response, including
  `frame-ancestors 'none'`
- same-origin scripts plus only the exact Expo hydration hash
- only the paired managed Supabase HTTPS and WebSocket origins
- the live bundle uses that exact managed origin and contains no alternate
  Supabase cloud project
- MIME, opener, resource, permission, referrer, and transport protection
- shell revalidation with `no-cache`, `no-store`, and `must-revalidate`
- a content-addressed application bundle
- bounded EAS static-asset caching at one hour
- service-worker and imported-worker update checks that bypass the HTTP cache
- the live fingerprinted bundle contains the explicit `emailRedirectTo`
  behavior used by email sign-in
- the live fingerprinted bundle maps Supabase `otp_expired` callbacks to a
  fixed recovery message instead of silently returning to the login form
- the live fingerprinted bundle contains the controlled-beta email-only copy
  and the fail-closed social OAuth guard
- the deployed device-approval UI identifies a pending device with a short
  request ID and completes its recipient-bound handoff automatically, without
  a transfer-code input
- web auth uses durable Supabase session persistence and migrates a session
  once from the previous browser vault so ordinary reloads do not discard it
- inbound sync isolates per-record delivery failures, allowing valid later
  rows to reach local storage while the failed row remains retryable
- stored AES envelopes are decoded to bytes before Expo Crypto parses them,
  keeping the web and native decryption boundary interoperable
- the shared readable type scale is present in the hosted bundle; rendered
  inspection at 1280x720 confirms 12px labels, 13-15px supporting copy, a 47px
  headline, and no horizontal overflow

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
a stale redirect. Each email sign-in request now also supplies its own
platform callback: the active HTTPS origin on web and the allowlisted
`organa://` callback on native. Previously issued email links retain their
original signed redirect and must not be used to assess the corrected
deployment.

An exact browser replay of the reported `otp_expired` fragment now shows that
the link was already used or is no longer valid, directs the person to request
and enter a verification code, and removes the stale error fragment from the
address bar. Supabase and Maileroo both document that external tracking or
inbox security prefetch can consume or rewrite one-time links; Maileroo tracking
must therefore be disabled for the Auth sending domain before link-based
security flows are accepted.

A production-build browser walkthrough proved the hard-disabled social OAuth
path renders zero provider controls and zero social/email dividers while
retaining the email field and verification-code action. Provider discovery
does not run during the controlled beta, and a programmatic OAuth start also
fails closed. The retained provider-settings adapter and PKCE callback path
remain available for a deliberate post-beta release.

## Remaining Gates

- Promote a reviewed export through the `production` EAS environment and run
  the same live verifier against the production origin.
- Exercise install, offline restart, service-worker replacement, and
  permission-granted Web Push in every supported release browser.
- Repeat the confirmed Maileroo email-code flow against production.
- Complete the connected production repeat, physical-device matrix,
  independent security review, legal review, signing, and store evidence.

No tests were added, changed, or run for this milestone.
