# Self-Hosted Supabase Testing

Status prepared on 2026-07-24.

This runbook connects Organa to a Docker-based Supabase instance on a home
server for connected testing. It does not make a home server a production
service and does not replace the physical-device, independent security, legal,
privacy, signing, or store gates in `docs/ACCEPTANCE.md`.

Use the current
[official Supabase self-hosting files](https://supabase.com/docs/guides/self-hosting/docker)
rather than copying a Docker Compose stack into this repository. Record the
exact Supabase source revision and image versions used for every test cycle.

## 1. Server And Network Boundary

The current Supabase minimum for the full stack is 4 GB RAM, 2 CPU cores, and
40 GB SSD; 8 GB RAM, 4 cores, and 80 GB SSD are recommended. Organa requires
Auth, PostgreSQL/PostgREST, Realtime, and Edge Functions. Storage and image
services are not required by the current MVP.

Use two HTTPS origins:

```text
App:      https://app.example.net
Supabase: https://supabase.example.net
```

For testing only on the same machine, Organa also accepts loopback HTTP.
Phones, OAuth providers, Web Push, and remote browsers need a publicly trusted
HTTPS endpoint. Do not weaken Organa's endpoint validation or disable TLS
verification.

Network rules:

- Publish only TCP 80/443 through a reverse proxy.
- Restrict SSH to trusted source addresses or a private VPN.
- Do not expose PostgreSQL, Supavisor, Studio, the Edge Runtime, or Kong
  directly to the public internet.
- The reverse proxy must support WebSocket upgrades and forwarded headers for
  Realtime.
- Protect Studio with a unique high-entropy password and do not reuse any
  generated database, JWT, API, scheduler, SMTP, OAuth, or VAPID secret.

## 2. Install The Official Docker Stack

On the Linux home server, first confirm every prerequisite and that the current
user can reach the Docker daemon:

```sh
git --version
docker --version
docker compose version
docker info >/dev/null
openssl version
jq --version
```

If only `openssl` or `jq` is missing on Debian or Ubuntu, install it before
continuing:

```sh
sudo apt-get update
sudo apt-get install -y openssl jq
```

Install Git and Docker Engine/Compose from their official instructions rather
than continuing after a failed preflight. Then copy the current official stack:

```sh
git clone --depth 1 https://github.com/supabase/supabase.git
mkdir -p "$HOME/organa-supabase"
cp -a supabase/docker/. "$HOME/organa-supabase/"
cd "$HOME/organa-supabase"
git -C ../supabase rev-parse HEAD
```

From the development machine, copy Organa's initializer and preflight into the
fresh stack:

```sh
scp supabase/self-hosted/initialize-official-supabase.sh \
  SERVER:~/organa-supabase/
scp supabase/self-hosted/validate-self-hosted.sh \
  SERVER:~/organa-supabase/
```

Then initialize the fresh stack on the server:

```sh
cd "$HOME/organa-supabase"
sh initialize-official-supabase.sh --fresh
```

The initializer creates the mode-600 `.env` before invoking either upstream
key generator, runs both generators in explicit update mode, captures their
credential-bearing output in a mode-600 temporary file that is removed on
success or interruption, preserves conventional nonzero HUP/INT/TERM exit
statuses, and finishes with Organa's non-secret-leaking key preflight. On
failure it prints only upstream error/warning lines and withholds generated
values. It refuses to run if any `.env` path already exists so an existing
instance cannot be rotated accidentally.

If `add-new-auth-keys.sh` was run directly and reports that `.env` is missing,
stop and verify the current directory before rerunning either key script. Use
this manual recovery only for a fresh copied stack that has never started:

```sh
pwd
ls -la .env.example docker-compose.yml run.sh \
  utils/generate-keys.sh utils/add-new-auth-keys.sh \
  validate-self-hosted.sh
[ ! -e .env ] || { echo ".env already exists; stop" >&2; exit 1; }
cp .env.example .env
chmod 600 .env
sh utils/generate-keys.sh --update-env
sh utils/add-new-auth-keys.sh --update-env
sh validate-self-hosted.sh keys
```

All six paths in the `ls` command must exist. If they do not, return to
`$HOME/organa-supabase` or the directory where the official Docker files were
copied. The manual upstream scripts print generated credentials while writing
them; do not copy their output into chat, logs, screenshots, or shell-history
notes, and do not print or share the generated `.env`. Organa's initializer
suppresses that credential output, so prefer it for a fresh stack.

Record the printed Git revision outside the server's secret files. Review the
generated `.env`; never run the example passwords or keys. The second script
enables the current asymmetric signing keys plus:

```text
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

Only `SUPABASE_PUBLISHABLE_KEY` is embedded in Organa. `SUPABASE_SECRET_KEY`,
legacy service-role material, database credentials, signing keys, and
scheduler secrets stay server-side.

The key script also tries to uncomment asymmetric verification variables in
the current upstream Compose file. Organa does not rely on that in-place edit:
`docker-compose.organa.yml` explicitly passes the private signing set to Auth
and the matching verification JWKS to PostgREST, Realtime, Storage, and Edge
Functions. The server preflight validates the private/public key structure,
matching EC and legacy entries, asymmetric gateway JWT shape, and resolved
service wiring without printing any key material.

Set the public URL contract in the server `.env`:

```text
SUPABASE_PUBLIC_URL=https://supabase.example.net
API_EXTERNAL_URL=https://supabase.example.net/auth/v1
SITE_URL=https://app.example.net
ADDITIONAL_REDIRECT_URLS=https://app.example.net/**,organa://**,http://localhost:8081/**
PROXY_DOMAIN=supabase.example.net
```

`API_EXTERNAL_URL` includes `/auth/v1` in the current self-hosted contract.
Use the official Caddy override or an equivalent existing reverse proxy:

```sh
sh run.sh config add caddy
sh run.sh start
sh run.sh logs
curl -I https://supabase.example.net/auth/v1/
```

A reachable Auth endpoint normally answers this unauthenticated probe with
`401`. Check that every container is healthy before applying Organa.

## 3. Configure Email And OAuth

Transfer the Auth override, private-environment template, and email template
from the development machine before configuring them:

```sh
scp supabase/self-hosted/docker-compose.organa.yml \
  SERVER:~/organa-supabase/
scp supabase/self-hosted/.env.auth.example \
  SERVER:~/organa-supabase/
ssh SERVER 'mkdir -p "$HOME/organa-supabase/volumes/templates"'
scp supabase/templates/email-code.html \
  SERVER:~/organa-supabase/volumes/templates/
```

Organa's account requirement needs at least email OTP for the first connected
drill. Configure a real SMTP relay in the self-hosted `.env`:

```text
SMTP_ADMIN_EMAIL=admin@example.net
SMTP_HOST=smtp.example.net
SMTP_PORT=465
SMTP_USER=replace-on-server
SMTP_PASS=replace-on-server
SMTP_SENDER_NAME=Organa
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false
ENABLE_PHONE_SIGNUP=false
```

The checked-in `supabase/templates/email-code.html` emits the six-digit
`{{ .Token }}` expected by the app. Self-hosted Auth reads custom templates
from a URL, not directly from a mounted HTML file. The Organa Compose override
serves this template only inside the Compose network and configures both the
confirmation and magic-link paths, because new and returning addresses can
take different Auth flows. It also fixes the OTP length at six digits and the
lifetime at 900 seconds so the app and email copy remain accurate.

Google, Apple, and GitHub are separate provider drills. Each provider must use:

```text
https://supabase.example.net/auth/v1/callback
```

Register that exact callback in every provider console. Apple OAuth
additionally needs an Apple Developer Services ID and a client-secret JWT that
is rotated before its six-month expiry.

Copy the secret-free Auth template and fill every empty client ID and secret
on the server:

```sh
[ -f .env.auth ] || cp .env.auth.example .env.auth
chmod 600 .env.auth
${EDITOR:-vi} .env.auth
```

The checked-in Compose override passes the provider variables directly to
Auth and derives all three callback values from `API_EXTERNAL_URL`; do not
duplicate the callback or provider secrets in `docker-compose.yml`.

After configuration, inspect the Auth settings endpoint with the publishable
key and confirm only the intended providers are enabled. Never use a secret or
service-role key for this request or in Organa.

## 4. Apply Organa Migrations

Keep the database port private. Use an SSH tunnel or private VPN to reach the
stack's session-mode PostgreSQL/Supavisor endpoint. Obtain the exact
session-mode connection string from the self-hosted stack and percent-encode
special characters in it.

From this repository on the development machine, create a mode-600 one-line
credential file with a local editor. The line must be the complete
percent-encoded session-mode PostgreSQL URL:

```sh
umask 077
${EDITOR:-vi} .organa-self-hosted-db-url
chmod 600 .organa-self-hosted-db-url
node supabase/self-hosted/apply-organa-migrations.mjs plan
```

After confirming a regular non-symlink file with mode 600 or 400, the helper
reads and immediately deletes it before parsing or running any Git/CLI
preflight. A malformed credential is therefore still consumed; a wrong-mode,
symlinked, or unreadable path is rejected without reading or deleting it. The
helper passes only a passwordless URL to the pinned Supabase CLI and supplies
the decoded password through a mode-600 temporary libpq password file. The
`plan` command lists pending migrations without applying them.

After reviewing that output, recreate the same one-line credential file and
run the explicit mutating mode:

```sh
umask 077
${EDITOR:-vi} .organa-self-hosted-db-url
chmod 600 .organa-self-hosted-db-url
node supabase/self-hosted/apply-organa-migrations.mjs apply
```

`apply` repeats the dry run, pushes the migrations with pinned Supabase CLI
`2.109.1`, and runs database lint at warning level while failing on errors.
Record the printed CLI version, Git revision, migration count, plan/push
output, and lint output. Never put the database URL in shell history, source
control, a client environment variable, or release evidence.

## 5. Install Organa Edge Functions

Copy these directories to the server's self-hosted function volume:

```text
supabase/functions/finalize-account-deletions
supabase/functions/dispatch-web-push
```

For example, from the development machine:

```sh
scp -r supabase/functions/finalize-account-deletions \
  SERVER:~/organa-supabase/volumes/functions/
scp -r supabase/functions/dispatch-web-push \
  SERVER:~/organa-supabase/volumes/functions/
scp supabase/self-hosted/.env.functions.example \
  SERVER:~/organa-supabase/
scp supabase/self-hosted/run-organa-schedulers.sh \
  SERVER:~/organa-supabase/
```

Generate the VAPID pair on the development machine. This command prints both
keys, so do not paste its output into chat or logs:

```sh
pnpm --filter @organa/app exec web-push generate-vapid-keys
```

On the server, create the private function environment and two independent
scheduler secrets:

```sh
cd "$HOME/organa-supabase"
[ -f .env.functions ] || cp .env.functions.example .env.functions
chmod 600 .env.functions
openssl rand -hex 32
openssl rand -hex 32
```

Put one generated value in each scheduler variable, then add the VAPID pair
and an administrator contact subject:

```text
ACCOUNT_DELETION_SCHEDULER_SECRET=unique-random-value
WEB_PUSH_VAPID_PUBLIC_KEY=generated-public-value
WEB_PUSH_VAPID_PRIVATE_KEY=generated-private-value
WEB_PUSH_VAPID_SUBJECT=mailto:admin@example.net
WEB_PUSH_ALLOWED_HOSTS=fcm.googleapis.com,updates.push.services.mozilla.com,*.push.apple.com
WEB_PUSH_SCHEDULER_SECRET=different-unique-random-value
```

`WEB_PUSH_ALLOWED_HOSTS` is a comma-separated list of lowercase exact
hostnames or explicit `*.` suffix patterns, with no spaces. Confirm the actual
hostnames returned by every supported release browser rather than assuming
the example remains complete. The dispatcher rejects IP literals,
credentials, non-HTTPS URLs, nonstandard ports, fragments, and any hostname
outside this list before making a network request. This is an outbound request
boundary for the self-hosted network; do not add broad suffixes or hosts you do
not trust.

Enable the checked-in Organa override and validate the merged configuration
without printing its environment:

```sh
sh run.sh config add organa
grep -q '^FUNCTIONS_VERIFY_JWT=false$' .env || {
  echo "FUNCTIONS_VERIFY_JWT must be false" >&2
  exit 1
}
docker compose config --quiet
```

Confirm the generated Supabase `.env` still has
`FUNCTIONS_VERIFY_JWT=false`. Both Organa functions reject every request except
`POST` with their own independent scheduler bearer secret. A platform JWT
check would reject those scheduler credentials before the function can
validate them. Revisit the global setting before adding any function that
relies only on a user JWT.

Run the secret-safe full preflight before starting or recreating the stack:

```sh
sh validate-self-hosted.sh full
```

The script reports only missing or invalid key names, files, permissions,
URLs, SMTP/provider configuration, Auth callback/template wiring, Compose
services, and daemon access. It never prints credential values.
To recheck only initial key generation, run:

```sh
sh validate-self-hosted.sh keys
```

The self-hosted runtime already supplies its internal `SUPABASE_URL` and
service-role credential. Recreate the function service after changing code or
environment:

```sh
sh run.sh recreate auth templates-server functions
```

Verify the public Auth capabilities without placing the publishable key in
shell history:

```sh
ORGANA_SUPABASE_URL=$(
  awk -F= '$1 == "SUPABASE_PUBLIC_URL" { sub(/^[^=]*=/, ""); print; exit }' .env
)
ORGANA_PUBLISHABLE_KEY=$(
  awk -F= '$1 == "SUPABASE_PUBLISHABLE_KEY" { sub(/^[^=]*=/, ""); print; exit }' .env
)
curl --fail --silent --show-error \
  -H "apikey: $ORGANA_PUBLISHABLE_KEY" \
  "$ORGANA_SUPABASE_URL/auth/v1/settings" |
  jq -e '
    .external.email == true
    and .external.phone == false
    and .external.google == true
    and .external.apple == true
    and .external.github == true
  ' >/dev/null
unset ORGANA_SUPABASE_URL ORGANA_PUBLISHABLE_KEY
```

This check is silent on success and exposes neither the key nor the settings
payload. Run an actual email-code sign-in before trying the three external
providers so SMTP and both OTP template paths are exercised first.

Run both scheduler-authenticated functions once. Success is silent; failures
name only the failed function and never print its bearer value:

```sh
sh run-organa-schedulers.sh
```

Then open the current user's crontab:

```sh
crontab -e
```

Add exactly one once-per-minute entry:

```text
* * * * * /bin/sh "$HOME/organa-supabase/run-organa-schedulers.sh"
```

The runner uses an advisory file lock, so a slow invocation cannot overlap the
next minute. It attempts both functions even if one fails and emits output only
on failure. Configure the server's cron failure/output monitoring and observe
at least two consecutive successful minute runs before checking the scheduler
acceptance row. Keep secrets in `.env.functions`; they never belong directly
in crontab or logs.

## 6. Configure Organa

On the development machine, create an untracked
`apps/mobile/.env.local`:

```text
EXPO_PUBLIC_SUPABASE_URL=https://supabase.example.net
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_with_real_value
EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=replace_with_same_public_vapid_value
```

Only these three values are public. Build and run Organa from the same commit
that was used to apply migrations and copy functions:

```sh
pnpm --filter @organa/app exec tsc --noEmit --incremental false
pnpm build:web
pnpm build:native
pnpm audit --prod
```

Do not commit `apps/mobile/.env.local`. A setup-required screen means the URL or
publishable key is missing or rejected; do not work around it with a secret
key.

## 7. Connected Test Sequence

Use unique test accounts and synthetic content:

Before the manual two-client drills, run the guarded backend contract verifier
from the development machine. It creates two synthetic password-authenticated
accounts through the administrator API, exercises the same RLS, trusted-device,
reminder-ownership, Web Push storage, and deletion read-only contract used by
local verification, measures a two-session private Realtime mutation, recovers
a deliberately missed event from durable ciphertext, and deletes both accounts
in a `finally` cleanup.

Create its ignored mode-600 configuration with a local editor:

```sh
cp .organa-connected-supabase.example.json .organa-connected-supabase.json
chmod 600 .organa-connected-supabase.json
${EDITOR:-vi} .organa-connected-supabase.json
```

Set `supabaseUrl` to the public HTTPS origin without `/auth/v1`. Use
`SUPABASE_PUBLISHABLE_KEY` for `publishableKey` and `SUPABASE_SECRET_KEY` for
`secretKey`. Set `supabaseSourceRevision` to the exact lowercase 40-character
revision printed when the official Docker stack was copied. Keep the secret
key only in this ignored operator file. Change
`allowSyntheticAccountCreationAndDeletion` to `true` only for the isolated
controlled-beta test deployment, then run the guarded baseline:

```sh
pnpm verify:connected:acceptance
```

The runner requires a clean Organa commit and a recorded Supabase revision. It
refuses placeholder/insecure URLs, legacy or swapped key types, unsupported
configuration fields, oversized files, credential files not owned by the
current operator, symlinked or non-private credential files, and missing
destructive-test consent. Before creating users it confirms email, Google,
Apple, and GitHub are enabled and phone Auth is disabled through the public
settings endpoint. Its output contains check labels and counts only, never
keys, sessions, proofs, or payloads.

Avoid interrupting a connected run. If `SIGHUP` on Unix, `SIGINT`, or
`SIGTERM` is received, the parent records a failed run, forwards the signal to
the active phase, and waits for its cleanup instead of abandoning it. Each
phase records the exact random email before requesting account creation.
Cleanup deletes every known user, searches Auth users for only those exact
generated emails, retries that reconciliation for 20 seconds when creation had
an ambiguous response, and verifies absence before a phase can pass. It never
deletes by prefix. If cleanup still reports a failure, inspect and remove only
synthetic Auth users whose addresses use the prefix named in the error.

Every run that clears preflight writes a mode-600 JSON result below the ignored
and current-user-owned `.organa-connected-evidence/` directory. The evidence
records the exact Organa commit, confirmation that the same clean commit was
still present before every phase and after all phases, confirmation that the
same private operator configuration remained in use, declared Supabase source
revision, public origin, runtime, timestamps, duration, interruption signal,
sanitized process error code, and pass/fail status for each completed phase.
A source/config change, spawn failure, interruption, failed cleanup, or failed
phase prevents passing evidence. Config equality is checked in memory; no key
or key-derived digest is written. The file never records credentials, sessions,
proofs, ciphertext, Push capabilities, scheduler secrets, or user content.

The lower-level verifier files are runner internals. Only the guarded
`verify:connected:acceptance*` commands produce acceptance evidence; do not use
standalone child-script output to mark a connected row complete.

Passing this command is evidence for the connected Auth configuration and
backend authorization contract. It also proves one raw encrypted-record
broadcast reaches a separate same-account session within the one-second target
and that an unsubscribed session can recover a later ciphertext row with the
app's overlapping durable cursor.

The baseline also creates one current-format Brain Dump bullet and two
concurrent Yjs edits from separate authenticated sessions using separate
trusted-device proofs. It encrypts every field with the same record-bound
AES-GCM envelope contract as the app, verifies the peer can recover a missed
delta from durable ciphertext, decrypts and merges both edits in either order,
rejects an incomplete compaction set, retains one converged encrypted snapshot,
and races a structured stale update against deletion. The final state must
contain only the encrypted bullet tombstone with no identifiable delta row or
delta history.

The same command creates a separate live target-device session on the private
device channel. It verifies content-free primary-switch, restoration,
secondary-opt-in, and revocation broadcasts within the one-second target; the
peer reads the resulting atomic ownership state, performs a proof-gated
operation as the target device, then observes its own revocation. Finally, the
revoked proof is rejected and the target refresh token fails after the revoker
invalidates other account sessions, matching the app's revocation sequence.

This is direct backend/live-session evidence, not a rendered-app walkthrough.
It proves the verifier's client-format encrypted Yjs protocol, but not
decrypted UI propagation, offline repository replay, local erasure on a real
target client, real provider redirects, SMTP delivery, Edge Function
scheduling, browser Push, or physical-device behavior; perform the remaining
drills below.

After deploying the current Web Push function and observing the configured
crontab run on consecutive minutes, use the short connected scheduler drill.
Temporarily append the reserved probe hostname to
`WEB_PUSH_ALLOWED_HOSTS`, then recreate the function service:

```text
WEB_PUSH_ALLOWED_HOSTS=fcm.googleapis.com,updates.push.services.mozilla.com,*.push.apple.com,push.invalid
```

```sh
sh run.sh recreate functions
sh validate-self-hosted.sh full
```

In the private connected configuration, temporarily set:

```text
"allowWebPushSchedulerDrill": true
```

Then run:

```sh
pnpm verify:connected:acceptance:web-push
```

This command requires both the temporary config consent and the explicit
Web-Push command name. It reruns the connected baseline first, then creates one
`web-push-live-` synthetic account and a valid P-256 Push subscription with a
content-free route. Its endpoint uses the reserved, non-resolving `.invalid`
namespace, so no internal service, real Push provider, or third-party capture
service receives the request. The command never invokes the Edge Function and
never reads the scheduler bearer. It waits up to three minutes for the real
cron path to:

- authorize and invoke `dispatch-web-push`
- validate that the configured VAPID public/private keys are a matching pair
- authorize the reserved probe through the configured Push-host allowlist
- claim the due reminder exactly once
- construct the encrypted, VAPID-signed Web Push request
- record the expected transport failure and clear the claim
- reschedule the reminder by five minutes while retaining the subscription

The dispatcher now returns `500` before claiming reminders when its VAPID pair
or subject is malformed, so retry state cannot falsely count invalid server
credentials as scheduler evidence. The operator command prints no account ID,
key, proof, token, endpoint capability, payload, or scheduler secret and
attempts bounded cleanup on failure or interruption. Set
`allowWebPushSchedulerDrill` back to `false` after the run. Remove
`push.invalid` from `WEB_PUSH_ALLOWED_HOSTS`, recreate `functions`, and rerun
the full preflight before browser delivery validation.

A pass plus the full preflight, installed once-per-minute crontab, and
consecutive scheduler logs supports the Web Push function/scheduler acceptance
row. It does not prove successful delivery, replacement, deep links,
cancellation, denial fallback, or sign-out behavior in any browser.

After the account-deletion function and its once-per-minute scheduler are
deployed, use the separate long-running drill to verify the real one-hour
contract. Do not invoke the function manually or rewrite `execute_after` for
this evidence. In the same private connected configuration, temporarily set:

```text
"allowOneHourDeletionDrill": true
```

Then keep the client machine awake and connected while running:

```sh
pnpm verify:connected:acceptance:deletion
```

This command requires both the temporary config consent and the explicit
deletion command name. It reruns the connected baseline first, then
intentionally takes at least 60 minutes and allows the scheduler five
additional minutes. It creates one `deletion-live-` synthetic account, seeds
ciphertext, mutation history, a pending device approval, and content-free Web
Push state, then verifies:

- the server sets an exact one-hour deadline
- encrypted, device, and Web Push writes are read-only while deletion is pending
- cancellation persists before the deadline and writes resume immediately
- a second request leaves the Auth user present through the deadline boundary
- the real scheduler permanently removes the Auth user
- the refresh session is invalid and every user-owned row has cascaded

The command polls Auth without printing account IDs, credentials, proofs,
tokens, Push capabilities, or payloads. On failure or interruption it uses a
separate bounded cleanup client to delete the disposable account; if cleanup
also fails, remove only Auth users with the `deletion-live-` prefix. Set
`allowOneHourDeletionDrill` back to `false` after the run.

Capture the sanitized command outcome and corresponding scheduler/function logs
before checking the connected deletion acceptance row. Preparing the command
does not count as evidence, and this drill does not cover encrypted-export
restore on a separate clean device.

1. Sign in by email OTP, then Google, Apple, and GitHub as each provider is
   configured.
2. Confirm recovery-key setup and approve a second clean browser/device.
3. Apply cross-account read/write/RPC probes and confirm RLS isolation.
4. Create and edit encrypted tasks, settings, Check-In entries, templates, and
   Brain Dump bullets on two active clients.
5. Measure ordinary Realtime propagation and recover a deliberately missed
   broadcast through durable reconciliation.
6. Disconnect one client, mutate both sides, reconnect, and inspect the merged
   structured records and Yjs result.
7. Repeat reminder promotion/revocation in two rendered clients and confirm the
   target client erases local data while duplicate reminders remain suppressed.
8. Exercise permission-granted Web Push, replacement, cancellation, deep
   links, sign-out cleanup, and the active-tab fallback.
9. Restore an encrypted export on a separate clean client.
10. Run the guarded one-hour connected deletion verifier and retain its
    sanitized scheduler evidence.
11. Inspect database rows and function/scheduler logs for plaintext user
    content or leaked secrets.

Record exact clients, timestamps, latency, server revision, Organa commit, and
sanitized outcomes in release evidence. Do not place OTPs, recovery codes,
device proofs, content keys, access/refresh tokens, Push capabilities, SMTP
credentials, or user content in that evidence.

## 8. Operations And Recovery

Self-hosting makes the operator responsible for updates, monitoring, backups,
restore, capacity, and incident response.

Before meaningful testing:

- Create encrypted automated PostgreSQL backups and copy them off the server.
- Back up the self-hosted configuration and signing material separately from
  database backups.
- Define retention and verify a restore onto an isolated disposable stack.
- Monitor disk usage, database health, Auth, Realtime, function failures,
  certificate expiry, SMTP delivery, scheduler failures, and backup age.
- Patch the host and update only to a reviewed Supabase Compose revision;
  record image changes and repeat connected validation after upgrades.
- Treat the server as unavailable rather than bypassing TLS, RLS, encryption,
  or device-proof checks during an incident.

## 9. What This Can And Cannot Close

A correctly configured home server can provide evidence for the functional
connected-backend rows in `docs/ACCEPTANCE.md`. It cannot by itself prove:

- production availability, backup, restore, monitoring, or incident response
- the promised final data region and processor/legal commitments
- physical iOS/Android behavior
- independent cryptographic/application security review
- App Store/Play signing, privacy declarations, or release artifacts

Those remain mandatory before production launch.

## Primary References

- [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Reverse Proxy and HTTPS](https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https)
- [New self-hosted API and signing keys](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys)
- [Self-hosted OAuth providers](https://supabase.com/docs/guides/self-hosting/self-hosted-oauth)
- [Self-hosted email templates](https://supabase.com/docs/guides/self-hosting/custom-email-templates)
- [Self-hosted Edge Functions](https://supabase.com/docs/guides/self-hosting/self-hosted-functions)
- [Supabase CLI database push](https://supabase.com/docs/reference/cli/supabase-db-push)
- [Supabase CLI database lint](https://supabase.com/docs/reference/cli/supabase-db-lint)
