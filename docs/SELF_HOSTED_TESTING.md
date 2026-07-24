# Self-Hosted Supabase Testing

Status prepared on 2026-07-24.

This runbook connects Organa to a Docker-based Supabase instance on a home
server for connected testing. It does not make a home server a production
service and does not replace the physical-device, independent security, legal,
privacy, signing, or store gates in `docs/ACCEPTANCE.md`.

Use the current official Supabase self-hosting files rather than copying a
Docker Compose stack into this repository. Record the exact Supabase source
revision and image versions used for every test cycle.

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
[ -f .env ] || cp .env.example .env
chmod 600 .env
sh utils/generate-keys.sh
sh utils/add-new-auth-keys.sh
```

If `add-new-auth-keys.sh` reports that `.env` is missing, stop and verify the
current directory before rerunning either key script:

```sh
pwd
ls -la .env.example docker-compose.yml utils/generate-keys.sh
[ -f .env ] || cp .env.example .env
chmod 600 .env
sh utils/generate-keys.sh
sh utils/add-new-auth-keys.sh
```

All three paths in the `ls` command must exist. If they do not, return to
`$HOME/organa-supabase` or the directory where the official Docker files were
copied. Do not print or share the generated `.env`.

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

Organa's account requirement needs at least email OTP for the first connected
drill. Configure a real SMTP relay in the self-hosted `.env`:

```text
SMTP_ADMIN_EMAIL=admin@example.net
SMTP_HOST=smtp.example.net
SMTP_PORT=465
SMTP_USER=replace-on-server
SMTP_PASS=replace-on-server
SMTP_SENDER_NAME=Organa
```

The checked-in `supabase/templates/email-code.html` emits the six-digit
`{{ .Token }}` expected by the app. Self-hosted Auth reads custom templates
from a URL, not directly from a mounted HTML file. Serve the template from a
container available only inside the Compose network and configure both the
confirmation and magic-link template URLs. Keep the OTP lifetime at 900
seconds so the email copy remains accurate.

Google, Apple, and GitHub are separate provider drills. Each provider must use:

```text
https://supabase.example.net/auth/v1/callback
```

Enable the matching `GOTRUE_EXTERNAL_*` variables in the Auth service and
recreate that container. Provider secrets stay in the server `.env`. Apple
OAuth additionally needs an Apple Developer Services ID and a client secret
that is rotated before its six-month expiry.

After configuration, inspect the Auth settings endpoint with the publishable
key and confirm only the intended providers are enabled. Never use a secret or
service-role key for this request or in Organa.

## 4. Apply Organa Migrations

Keep the database port private. Use an SSH tunnel or private VPN to reach the
stack's session-mode PostgreSQL/Supavisor endpoint. Obtain the exact
session-mode connection string from the self-hosted stack and percent-encode
special characters in it.

From this repository on the development machine:

```sh
export ORGANA_SELF_HOSTED_DB_URL='postgresql://REPLACE_VIA_PRIVATE_TUNNEL'
pnpm dlx supabase@latest --version
pnpm dlx supabase@latest db push \
  --db-url "$ORGANA_SELF_HOSTED_DB_URL" \
  --dry-run
pnpm dlx supabase@latest db push \
  --db-url "$ORGANA_SELF_HOSTED_DB_URL"
pnpm dlx supabase@latest db lint \
  --db-url "$ORGANA_SELF_HOSTED_DB_URL" \
  --level warning \
  --fail-on error
unset ORGANA_SELF_HOSTED_DB_URL
```

Record the CLI version, migration revision, dry-run output, push output, and
lint output. Never put the database URL in shell history, source control, a
client environment variable, or release evidence. Prefer a temporary
root-readable environment file over an inline command on a shared machine.

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
```

Create a server-only `.env.functions`, add it to the self-hosted stack's
`functions` service as an `env_file`, and set:

```text
ACCOUNT_DELETION_SCHEDULER_SECRET=unique-random-value
WEB_PUSH_VAPID_PUBLIC_KEY=generated-public-value
WEB_PUSH_VAPID_PRIVATE_KEY=generated-private-value
WEB_PUSH_VAPID_SUBJECT=mailto:admin@example.net
WEB_PUSH_SCHEDULER_SECRET=different-unique-random-value
```

Set `FUNCTIONS_VERIFY_JWT=false` in the self-hosted function-service
configuration. Both Organa functions reject every request except `POST` with
their own independent scheduler bearer secret. A platform JWT check would
reject those scheduler credentials before the function can validate them.
Revisit the global setting before adding any function that relies only on a
user JWT.

The self-hosted runtime already supplies its internal `SUPABASE_URL` and
service-role credential. Recreate the function service after changing code or
environment:

```sh
sh run.sh recreate functions
```

For initial testing, invoke each function manually with its independent
scheduler secret. Before a multi-day beta drill, configure a monitored
once-per-minute server-side scheduler for both POST requests. Keep secrets in a
root-readable file rather than placing them directly in crontab or logs.

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
7. Promote and revoke reminder devices and confirm duplicate reminders remain
   suppressed.
8. Exercise permission-granted Web Push, replacement, cancellation, deep
   links, sign-out cleanup, and the active-tab fallback.
9. Restore an encrypted export on a separate clean client.
10. Request deletion, verify the read-only hour and cancellation, then use a
    disposable account to exercise final deletion after the deadline.
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
