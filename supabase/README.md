# Organa Supabase Setup

Organa uses Supabase for authentication, encrypted synchronization, private
Realtime signals, trusted-device metadata, and delayed account deletion.

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
- grants clients read access only where required
- routes encrypted writes and device changes through validated
  security-definer RPCs
- keeps structured conflict history for seven days
- authorizes only the signed-in user's private Realtime topics
- broadcasts opaque record identifiers rather than plaintext content

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

## 5. Beta Validation

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

`pnpm verify:supabase` automates the local database checks and a live
account-deletion Edge Function drill. The hosted beta validation must repeat
them against the actual EU project.

Do not invite beta users until these tests pass against the actual EU project.
