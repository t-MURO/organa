# Managed Supabase Connected Testing

Status updated on 2026-07-27.

Organa uses the managed Supabase free tier as its selected production backend.
This designation identifies the live data plane and Auth service; it does not
replace physical-device, release-browser, independent security, legal,
privacy, signing, or store gates.

## Current Production Deployment

The linked production project is:

```text
Name: organa
Project ref: bkqinjscdxofsfgwozgd
Region: eu-west-2
Status at verification: ACTIVE_HEALTHY
Migration head: 20260726221031
```

All twelve checked-in migrations are applied. Linked database lint passes at
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
  --purpose production \
  --allow-synthetic-account-creation-and-deletion
pnpm verify:connected:config
```

The preparer refuses to overwrite an existing file. It requires the exact
linked project, matches the complete remote migration list to the repository,
retrieves exactly one modern publishable and secret key in memory, and writes
`.organa-connected-supabase.json` with mode `600`. The production purpose is
recorded in every connected evidence file and is mandatory for release
readiness.

Managed evidence is bound to the project ref and 14-digit applied migration
version. Self-hosted evidence instead uses the exact upstream Supabase source
Git revision and applied migration version. These identities are not
interchangeable.

## Production Auth Configuration

The controlled beta requires:

- email authentication enabled
- Phone authentication disabled

The live settings check currently reports email enabled and phone disabled,
with Google and GitHub disabled. Maileroo custom SMTP, both code-only
templates, and a live six-digit sign-in are accepted. The app also
hard-disables social OAuth, so a future backend setting change cannot expose
Google or GitHub before the client flag is deliberately enabled.

The managed project was found using Supabase's default link templates,
8-digit codes, a 60-minute expiry, and a local-only Site URL. Its OTP policy
has been corrected to six digits and 15 minutes. Its Site URL now uses the
stable production web origin, and its exact redirect set contains that origin,
the `organa://**` native callback, and the documented local development
origins. Provision and verify the same fail-closed URL set with:

```sh
pnpm configure:managed:auth-urls -- \
  --project-ref bkqinjscdxofsfgwozgd \
  --site-url https://organa.expo.app
pnpm configure:managed:auth-urls -- \
  --project-ref bkqinjscdxofsfgwozgd \
  --site-url https://organa.expo.app \
  --check-only
```

The former preview callback is no longer in the allowlist. The stable
production origin and its immutable deployment apply Organa's route security
headers and pass the 17-check live deployment verifier. The release-browser
matrix remains open. The command replaces the complete allowlist rather than
preserving stale or unintended redirect destinations.

Maileroo custom SMTP is configured. Apply and verify the checked-in code-only
templates with:

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

## Deferred Managed OAuth Provisioning

This section is retained for the post-beta social sign-in rollout. Do not
enable either provider for the controlled beta.

Google and GitHub must each use Supabase Auth's provider callback:

```text
https://bkqinjscdxofsfgwozgd.supabase.co/auth/v1/callback
```

For Google, create a Web application OAuth client, add
`https://organa--preview.expo.app` as an authorized JavaScript origin, and add
the callback above as an authorized redirect URI. For GitHub, create an OAuth
App with `https://organa--preview.expo.app` as its homepage and the same
Supabase callback as its authorization callback.

Do not paste provider secrets into commands, tracked files, issues, or
evidence. Start from `.organa-managed-oauth.example.json`, place real
credentials in the ignored `.organa-managed-oauth.json`, and make it private:

```sh
chmod 600 .organa-managed-oauth.json
pnpm configure:managed:oauth -- \
  --project-ref bkqinjscdxofsfgwozgd \
  --validate-only
pnpm configure:managed:oauth -- \
  --project-ref bkqinjscdxofsfgwozgd
pnpm configure:managed:oauth -- \
  --project-ref bkqinjscdxofsfgwozgd \
  --check-only
```

The apply path validates a bounded, current-user-owned regular file with mode
`600` or `400`, rejects symlinks, placeholders, malformed values, and extra
fields, and updates only provider-specific Auth fields. `--validate-only`
checks that file without contacting the managed project. The read-only
`--check-only` path does not open the credentials file. No path prints client
IDs or secrets.
After a future client release enables social OAuth, reload Organa: its
provider-aware sign-in screen will expose each enabled provider. Complete one
real web redirect and one native callback for each provider before accepting
that post-beta feature.

Deferred providers do not block controlled-beta backend evidence. Run:

```sh
pnpm verify:connected:acceptance:backend
```

This scope verifies the deployed RLS/RPC, encrypted Realtime/durable recovery,
Brain Dump convergence, reminder ownership, and revocation contracts. Its
phase and evidence scope are explicitly `backend-only`; it does not claim
post-beta provider acceptance.

## Current Managed Schema Hardening

Migration `20260726221031` is applied to the selected production project and
is the head of the same twelve-migration chain checked into this repository.

- Seven ownership policies use statement-cached `(select auth.uid())` checks
  while preserving Organa's existing trusted-device write requirements.
- The platform `rls_auto_enable()` event-trigger helper is not executable by
  `public`, `anon`, or `authenticated`.
- Composite indexes cover the encrypted-record updater and sync-mutation
  device foreign keys.
- The two RPC-only Web Push tables have restrictive deny policies for Data API
  client roles.
- Live security and performance advisors report zero remaining
  `rls_enabled_no_policy`, `auth_rls_initplan`, exposed-`rls_auto_enable`, or
  unindexed-foreign-key findings.

The remaining advisor notices are an explicit review inventory, not a blanket
clean bill of health: fifteen authenticated security-definer RPCs implement
Organa's proof-checked privileged API, password leak protection is not used by
the passwordless-only controlled beta, and scheduler/supporting indexes may be
reported unused depending on which live paths have run. The connected
acceptance verifier remains the behavioral boundary check for the intentional
RPCs.

## Captured Backend Evidence

Before production designation, on 2026-07-26, the same managed project passed
`pnpm verify:connected:acceptance` from clean commit
`f0cc0dae1b0d37aa7e86880f9499264424daa0ad`.

- The backend phase passed 124 checks at migration head `20260726180000`,
  including cross-account RLS,
  unauthorized and proof-gated RPCs, trusted-device approval/revocation,
  recipient-bound approval exchange and one-time claim erasure,
  reminder ownership across live sessions, private Realtime delivery within
  one second, durable missed-event recovery, ciphertext-only reads, and
  encrypted Brain Dump convergence/compaction/deletion races.
- The current
  [Supabase Realtime migration](https://github.com/supabase/realtime/blob/40be3de33aacc782bb60879c6bcf54c871847e15/lib/realtime/tenants/repo/migrations/20251103001201_broadcast_send_include_payload_id.ex)
  includes a generated UUID in payloads created by `realtime.send()`. The
  verifier permits only the expected opaque record or device hint plus a
  canonical UUID that matches Broadcast metadata.
- An earlier commit-bound Web Push phase passed the real once-per-minute cron
  path in 43 seconds. The deployed dispatcher rejected its reserved `.invalid`
  host before outbound access and removed both the reminder and subscription.
- The ignored sanitized evidence is bound to the managed project ref,
  migration `20260726180000`, runner version 5, and the exact clean commit.
  Optional destructive drill consents remained disabled.
- Synthetic accounts were deleted by the verifier. No API key, scheduler
  bearer, session, device proof, ciphertext, Push capability, or user content
  was serialized into evidence.

The separately consented one-hour deletion run from clean commit
`e433ad27d41464984983e485afb8a3420e5d9329` passed the 124-check baseline and
the 30-check scheduler-driven deletion phase in 60.3 minutes. The ignored
sanitized evidence is
`.organa-connected-evidence/connected-2026-07-26T16-21-39-881Z-e433ad27d414.json`.
Synthetic cleanup completed and `allowOneHourDeletionDrill` was reset to
`false` immediately after the run.

This historical evidence does not prove the final production-purpose commit,
email delivery at the stable production origin, deferred OAuth redirects,
permission-granted browser Push, or physical-device behavior.

Run the provider-qualified backend baseline independently:

```sh
pnpm verify:connected:acceptance
```

This command records `scope: "partial"` because it does not request the
scheduled Web Push and one-hour deletion phases. Only
`pnpm verify:connected:acceptance:full`, with both explicit drill consents
enabled, records `scope: "full"` and can satisfy the release-readiness gate.

Enable the Web Push scheduler consent without opening or printing the
credential-bearing private config:

```sh
pnpm configure:connected:drill-consent -- --web-push enabled
```

Use
`pnpm verify:connected:acceptance:backend:web-push` when the public Auth-policy
check is intentionally out of scope; otherwise use the full command. The
synthetic endpoint uses the reserved `.invalid` namespace and must remain
outside the production Push-host allowlist. A pass proves the real cron path
removes the rejected endpoint without outbound access.

Enable the deletion consent only when an operator is prepared to wait for and
observe the full destructive one-hour deletion drill:

```sh
pnpm configure:connected:drill-consent -- --one-hour-deletion enabled
```

Reset both consents immediately after the run:

```sh
pnpm configure:connected:drill-consent -- --web-push disabled --one-hour-deletion disabled
```

The production candidate must repeat every connected phase against its final
reviewed backend and use a separate release evidence manifest.
