# Organa Supabase Setup

Organa uses Supabase for authentication, encrypted synchronization, private
Realtime signals, trusted-device metadata, browser reminder delivery, and
delayed account deletion.

## 1. Create The Project

Create the project in an EU region. Record the project URL and publishable key:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never put a secret or service-role key in an Expo environment variable.

For controlled beta, configure a short JWT lifetime appropriate for the
project's risk profile. A revoked session's access token remains usable until
its JWT expires, even after its refresh token is revoked.

## 2. Configure Authentication

Enable:

- Google
- Apple
- GitHub
- Email OTP

Set both the confirmation and magic-link email templates to send the six-digit
`{{ .Token }}` value. The checked-in local template is
`supabase/templates/email-code.html`. Add these redirects, replacing the web
origin with the deployed origin:

```text
organa://**
https://app.example.com/**
http://localhost:8081/**
```

Provider consoles must contain the callback URL shown by Supabase for that
provider.

## 3. Apply And Validate The Database

For a local Docker-backed stack:

```sh
pnpm dlx supabase start
pnpm dlx supabase db reset
pnpm dlx supabase db lint --local --level warning
pnpm verify:supabase
```

For a linked EU project:

```sh
pnpm dlx supabase link --project-ref PROJECT_REF
pnpm dlx supabase db push
pnpm dlx supabase db lint --linked
```

The migration:

- enables RLS on every user-scoped public table
- makes first account-key/device enrollment atomic and prevents direct
  authenticated account-key replacement
- stores only hidden one-way recovery and device proof verifiers
- supports a 15-minute, target-bound encrypted content-key handoff approved by
  an existing trusted device; the backend never receives the one-time code
- requires the device proof for encrypted writes, reminder-device changes,
  approval, revocation, and deletion requests
- atomically quiets the previous primary reminder device when a new primary is
  selected, requiring explicit opt-in for any later secondary delivery
- grants clients read access only where required
- routes encrypted writes and device changes through validated
  security-definer RPCs
- keeps structured conflict history for seven days
- authorizes only the signed-in user's private Realtime topics
- broadcasts opaque record identifiers rather than plaintext content
- stores browser Push capabilities and content-free schedule metadata behind
  proof-gated RPCs with no direct authenticated table access
- removes a browser subscription when its trusted device is revoked or made
  quiet

In Realtime settings, disable public channel access for production. The client
calls `realtime.setAuth()` and subscribes only to:

```text
organa:<user-id>:encrypted-records
organa:<user-id>:devices
```

## 4. Deploy Account Deletion

The checked-in function configuration disables Supabase JWT verification
because this endpoint uses a separate scheduler secret. Deploy it with:

```sh
pnpm dlx supabase functions deploy finalize-account-deletions
pnpm dlx supabase secrets set ACCOUNT_DELETION_SCHEDULER_SECRET=LONG_RANDOM_VALUE
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the hosted
function environment. Schedule an authenticated request at least once per
minute:

```text
POST /functions/v1/finalize-account-deletions
Authorization: Bearer LONG_RANDOM_VALUE
```

Use a managed secret store or Supabase Vault for the scheduler value. Do not
put it in source control. Monitor non-2xx responses and the returned `failures`
array.

## 5. Configure Web Push

Generate one VAPID keypair. Keep the private key server-only:

```sh
pnpm --dir apps/mobile exec web-push generate-vapid-keys --json
```

Set the generated public key in the web build environment:

```sh
EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=URL_SAFE_PUBLIC_KEY
```

Set both keys, a contact subject, and an independent random scheduler secret
on the hosted project:

```sh
pnpm dlx supabase secrets set \
  WEB_PUSH_VAPID_PUBLIC_KEY=URL_SAFE_PUBLIC_KEY \
  WEB_PUSH_VAPID_PRIVATE_KEY=PRIVATE_KEY \
  WEB_PUSH_VAPID_SUBJECT=mailto:security@example.com \
  WEB_PUSH_SCHEDULER_SECRET=LONG_INDEPENDENT_RANDOM_VALUE
pnpm dlx supabase functions deploy dispatch-web-push
```

Never commit the private key or scheduler secret. Schedule this request once
per minute using Supabase Cron plus Vault, or an equivalent managed scheduler:

```text
POST /functions/v1/dispatch-web-push
Authorization: Bearer LONG_INDEPENDENT_RANDOM_VALUE
```

The official [Supabase scheduling
guide](https://supabase.com/docs/guides/functions/schedule-functions)
documents invoking Edge Functions with `pg_cron`, `pg_net`, and secrets stored
in Vault. Monitor non-2xx responses and the returned processed, delivered,
retried, expired-subscription, and failed counts.

`EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` is intentionally public. The private
key, scheduler secret, browser endpoint capability, and Push authentication
keys must be treated as sensitive. The dispatcher sends only an opaque route
and tag; the browser displays generic notification copy.

Before inviting beta users, validate a permission-granted delivery in every
release browser. iOS and iPadOS require the PWA to be added to the Home Screen.
Unconfigured, denied, and unsupported browsers retain the visible active-tab
fallback.

## 6. Beta Validation

Use two accounts and two physical devices or browsers to verify:

- one account cannot select or mutate another account's rows
- anon requests cannot invoke RPCs
- malformed, future-dated, and untrusted-device mutations are rejected
- proofless device registration, mutation, revocation, and deletion RPC calls
  are rejected
- a revoked device cannot re-enroll without the recovery-derived proof
- a pending device remains untrusted until a different trusted device approves
  it and the target proves possession of both its device secret and one-time
  approval code
- approval envelopes expire, can be rejected, and are erased after claim
- active deletion requests reject encrypted mutations and device changes
- different-field edits merge and same-field edits resolve deterministically
- a missed broadcast is recovered by a durable pull
- device reminder ownership updates on both clients
- revocation clears the target on its next online status check
- deletion is cancellable before one hour and finalizes after the deadline
- a trusted web reminder device can schedule a content-free Push reminder
- a quiet secondary browser cannot schedule Push until explicitly enabled
- switching the primary reminder device removes the demoted browser
  subscription
- sign-out removes the server subscription and unsubscribes the browser
- one-shot and daily Check-In reminders are dispatched and completed/advanced
  by the scheduled Edge Function

`pnpm verify:supabase` automates the local database checks plus live
account-deletion and Web Push Edge Function drills. `pnpm verify:web-push`
independently verifies VAPID headers and encrypted `aes128gcm` payload
construction. The hosted beta validation must repeat the applicable checks
against the actual EU project.

Do not invite beta users until these tests pass against the actual EU project.
