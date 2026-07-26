# Managed Supabase Connected Testing

Status updated on 2026-07-26.

Organa currently uses the managed Supabase free tier for connected-beta
engineering checks. This is a test deployment, not production approval. It
does not replace physical-device, release-browser, independent security,
legal, privacy, signing, or store gates.

## Current Deployment

The linked test project is:

```text
Name: organa
Project ref: bkqinjscdxofsfgwozgd
Region: eu-west-2
Status at verification: ACTIVE_HEALTHY
Migration head: 20260725120000
```

All nine checked-in migrations are applied. Linked database lint passes at
warning level with no schema errors. The `finalize-account-deletions` and
`dispatch-web-push` Edge Functions are active.

The project has active once-per-minute `pg_cron` jobs named:

```text
organa-finalize-account-deletions
organa-dispatch-web-push
```

On 2026-07-26, three consecutive runs of each job reported `succeeded`.
Their corresponding `pg_net` responses returned HTTP `200` without timeout or
transport error. Direct probes also proved that both functions reject missing
scheduler authorization with `401` and accept their configured scheduler
secret with `200`.

## Secret Boundaries

Only these public values belong in `apps/mobile/.env.local` or EAS:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
```

The modern `sb_secret_` key, scheduler bearer secrets, and VAPID private key
must remain server-side. Never put them in an `EXPO_PUBLIC_` variable,
release manifest, shell history, issue, log, or committed file.

The scheduler secrets are stored in Supabase Vault and Edge Function
configuration. Temporary local scheduler SQL and secret files were removed
after live verification.

## Prepare Connected Verification

Authenticate and link the pinned CLI:

```sh
npx --yes supabase@2.109.1 login
npx --yes supabase@2.109.1 link \
  --project-ref bkqinjscdxofsfgwozgd
```

Create the ignored operator config without printing or temporarily storing
either API key:

```sh
pnpm prepare:connected:managed -- \
  --project-ref bkqinjscdxofsfgwozgd \
  --allow-synthetic-account-creation-and-deletion
pnpm verify:connected:config
```

The preparer refuses to overwrite an existing file. It requires the exact
linked project, matches the complete remote migration list to the repository,
retrieves exactly one modern publishable and secret key in memory, and writes
`.organa-connected-supabase.json` with mode `600`.

Managed evidence is bound to the project ref and 14-digit applied migration
version. Self-hosted evidence instead uses the exact upstream Supabase source
Git revision and applied migration version. These identities are not
interchangeable.

## Remaining Auth Configuration

The baseline connected verifier intentionally checks public Auth settings
before creating synthetic accounts. Its backend phase remains blocked until
the project has:

- Google OAuth enabled
- GitHub OAuth enabled
- Phone authentication disabled

The live settings check currently reports email enabled and phone disabled,
with Google and GitHub disabled.
Provider acceptance additionally requires real Google and GitHub redirects
plus email code delivery through custom SMTP.
The managed free tier can use custom SMTP. Its default SMTP service cannot
apply Organa's custom email-code templates, so do not claim the email method
until custom SMTP and both email paths have been exercised.

The missing providers do not need to block independent backend evidence. Run:

```sh
pnpm verify:connected:acceptance:backend
```

This scope verifies the deployed RLS/RPC, encrypted Realtime/durable recovery,
Brain Dump convergence, reminder ownership, and revocation contracts. Its
phase and evidence scope are explicitly `backend-only`; release readiness
cannot count it as provider acceptance.

After Auth is configured, run the full provider-qualified scope:

```sh
pnpm verify:connected:acceptance
pnpm verify:connected:acceptance:web-push
```

Enable `allowWebPushSchedulerDrill` in the private config only for the
dedicated Web Push phase. Before providers are ready, use
`pnpm verify:connected:acceptance:backend:web-push`; afterward repeat the full
provider-qualified command. The synthetic endpoint uses the reserved
`.invalid` namespace and must remain outside the production Push-host
allowlist. A pass proves the real cron path removes the rejected endpoint
without outbound access.

Enable `allowOneHourDeletionDrill` only when an operator is prepared to wait
for and observe the full destructive one-hour deletion drill.

The production candidate must repeat every connected phase against its final
reviewed backend and use a separate release evidence manifest.
