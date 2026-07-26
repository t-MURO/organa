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
before creating synthetic accounts. The provider-qualified phase remains
blocked until the project has:

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

The managed project was found using Supabase's default link templates,
8-digit codes, a 60-minute expiry, and a local-only Site URL. Its OTP policy
has been corrected to six digits and 15 minutes. Its Site URL now uses the
live Expo web preview, and its exact redirect set contains that web origin,
the `organa://**` native callback, and the documented local development
origins. Provision and verify the same fail-closed URL set with:

```sh
pnpm configure:managed:auth-urls -- \
  --project-ref bkqinjscdxofsfgwozgd \
  --site-url https://organa--preview.expo.app
pnpm configure:managed:auth-urls -- \
  --project-ref bkqinjscdxofsfgwozgd \
  --site-url https://organa--preview.expo.app \
  --check-only
```

The preview is only the managed engineering callback target. It is not
production approval. Its current deployment applies Organa's route security
headers and passes the 16-check live deployment verifier, as recorded in
`docs/WEB_PREVIEW_EVIDENCE.md`, but the production promotion and
release-browser matrix remain open. Replace `--site-url` with the reviewed
production HTTPS origin before production acceptance. The command replaces
the complete allowlist rather than preserving stale or unintended redirect
destinations.

The link templates cannot be replaced until custom SMTP is configured. After
adding custom SMTP in the Supabase dashboard, apply and verify the checked-in
code-only templates with:

```sh
pnpm configure:managed:email-otp -- \
  --project-ref bkqinjscdxofsfgwozgd
pnpm configure:managed:email-otp -- \
  --project-ref bkqinjscdxofsfgwozgd \
  --check-only
```

Both managed Auth commands require the exact linked project and share the same
Supabase CLI credential boundary. They read the existing login from its native
credential store or private file fallback and never print the access token,
SMTP values, or template bodies. The OTP command updates only the OTP
length/expiry and the confirmation/magic-link subjects and bodies.
Organa deliberately keeps the code out of the subject line so notification
previews do not expose it.

The missing providers do not need to block independent backend evidence. Run:

```sh
pnpm verify:connected:acceptance:backend
```

This scope verifies the deployed RLS/RPC, encrypted Realtime/durable recovery,
Brain Dump convergence, reminder ownership, and revocation contracts. Its
phase and evidence scope are explicitly `backend-only`; release readiness
cannot count it as provider acceptance.

## Captured Backend Evidence

On 2026-07-26, the managed test project passed
`pnpm verify:connected:acceptance:backend:web-push` from clean commit
`eb13fe3430c2471b7fb1ca97a6693d98609de5b3`.

- The backend phase passed 119 checks, including cross-account RLS,
  unauthorized and proof-gated RPCs, trusted-device approval/revocation,
  reminder ownership across live sessions, private Realtime delivery within
  one second, durable missed-event recovery, ciphertext-only reads, and
  encrypted Brain Dump convergence/compaction/deletion races.
- The current
  [Supabase Realtime migration](https://github.com/supabase/realtime/blob/40be3de33aacc782bb60879c6bcf54c871847e15/lib/realtime/tenants/repo/migrations/20251103001201_broadcast_send_include_payload_id.ex)
  includes a generated UUID in payloads created by `realtime.send()`. The
  verifier permits only the expected opaque record or device hint plus a
  canonical UUID that matches Broadcast metadata.
- The real once-per-minute Web Push cron processed the due synthetic probe in
  43 seconds. The deployed dispatcher rejected its reserved `.invalid` host
  before outbound access and removed both the reminder and subscription.
- The ignored sanitized evidence is bound to the managed project ref,
  migration `20260725120000`, runner version 5, and the exact clean commit.
  Both temporary drill consents were disabled again after the run.
- Synthetic accounts were deleted by the verifier. No API key, scheduler
  bearer, session, device proof, ciphertext, Push capability, or user content
  was serialized into evidence.

This evidence does not prove OAuth redirects, email delivery, permission-granted
browser Push, physical-device behavior, the one-hour deletion deadline, or a
production deployment repeat.

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
