#!/bin/sh

set -eu

stage="${1:-full}"

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

value_from() {
  file="$1"
  key="$2"
  awk -v key="$key" '
    index($0, key "=") == 1 {
      sub("^[^=]*=", "")
      print
      exit
    }
  ' "$file"
}

require_private_file() {
  file="$1"
  [ -f "$file" ] || fail "$file is missing"
  mode=$(
    stat -c '%a' "$file" 2>/dev/null ||
      stat -f '%Lp' "$file" 2>/dev/null ||
      true
  )
  case "$mode" in
    400|600) ;;
    *) fail "$file must have mode 600 or 400" ;;
  esac
}

require_generated_value() {
  file="$1"
  example_file="$2"
  key="$3"
  value=$(value_from "$file" "$key")
  [ -n "$value" ] || fail "$key is missing or empty in $file"

  if [ -f "$example_file" ]; then
    example_value=$(value_from "$example_file" "$key")
    [ "$value" != "$example_value" ] ||
      fail "$key still uses the example value in $file"
  fi
}

require_exact_value() {
  file="$1"
  key="$2"
  expected="$3"
  value=$(value_from "$file" "$key")
  [ "$value" = "$expected" ] ||
    fail "$key must be $expected in $file"
}

require_nonplaceholder_value() {
  file="$1"
  example_file="$2"
  key="$3"
  value=$(value_from "$file" "$key")
  [ -n "$value" ] || fail "$key is missing or empty in $file"

  if [ -f "$example_file" ]; then
    example_value=$(value_from "$example_file" "$key")
    [ "$value" != "$example_value" ] ||
      fail "$key still uses the example value in $file"
  fi

  case "$value" in
    replace-*|replace_*|your-*|your_*|changeme|CHANGE_ME|\
      *@example.com|*@example.net|*.example.com|*.example.net)
      fail "$key still uses a placeholder value in $file"
      ;;
  esac
}

require_configured_value() {
  file="$1"
  example_file="$2"
  key="$3"
  require_nonplaceholder_value "$file" "$example_file" "$key"
  value=$(value_from "$file" "$key")
  case "$value" in
    *[[:space:]]*) fail "$key must not contain whitespace in $file" ;;
  esac
}

require_jwt_value() {
  file="$1"
  key="$2"
  value=$(value_from "$file" "$key")
  printf '%s\n' "$value" |
    awk -F. '
      NF == 3 &&
      $1 ~ /^[A-Za-z0-9_-]+$/ &&
      $2 ~ /^[A-Za-z0-9_-]+$/ &&
      $3 ~ /^[A-Za-z0-9_-]+$/ {
        valid = 1
      }
      END { exit valid ? 0 : 1 }
    ' ||
    fail "$key is not a three-segment URL-safe JWT in $file"
}

require_asymmetric_keyset() {
  file="$1"
  signing_keys=$(value_from "$file" JWT_KEYS)
  verification_keys=$(value_from "$file" JWT_JWKS)
  printf '[%s,%s]\n' "$signing_keys" "$verification_keys" |
    jq -e '
      .[0] as $signing
      | .[1] as $verification
      | ($signing | type == "array" and length == 2)
        and ($verification | type == "object")
        and ($verification.keys | type == "array" and length == 2)
        and ($signing | any(.[];
          .kty == "EC"
          and .alg == "ES256"
          and .crv == "P-256"
          and (.d | type == "string" and length > 0)
          and (.x | type == "string" and length > 0)
          and (.y | type == "string" and length > 0)))
        and ($signing | any(.[];
          .kty == "oct"
          and .alg == "HS256"
          and (.k | type == "string" and length > 0)))
        and ($verification.keys | any(.[];
          .kty == "EC"
          and .alg == "ES256"
          and .crv == "P-256"
          and (has("d") | not)))
        and ($verification.keys | any(.[];
          .kty == "oct"
          and .alg == "HS256"
          and (.k | type == "string" and length > 0)))
        and (
          ($signing | map(
            select(.kty == "EC") | {alg, crv, kid, kty, x, y}
          ))
          ==
          ($verification.keys | map(
            select(.kty == "EC") | {alg, crv, kid, kty, x, y}
          ))
        )
        and (
          ($signing | map(select(.kty == "oct") | {alg, k, kty}))
          ==
          ($verification.keys | map(select(.kty == "oct") | {alg, k, kty}))
        )
    ' >/dev/null 2>&1 ||
    fail "JWT_KEYS and JWT_JWKS do not form a valid matching asymmetric keyset"
}

require_hex_secret() {
  file="$1"
  key="$2"
  value=$(value_from "$file" "$key")
  [ "${#value}" -eq 64 ] ||
    fail "$key must be a 64-character lowercase hexadecimal value"
  case "$value" in
    *[!0-9a-f]*) fail "$key must contain only lowercase hexadecimal characters" ;;
  esac
}

require_vapid_key() {
  file="$1"
  key="$2"
  expected_length="$3"
  value=$(value_from "$file" "$key")
  [ "${#value}" -eq "$expected_length" ] ||
    fail "$key has an invalid length"
  case "$value" in
    *[!A-Za-z0-9_-]*) fail "$key is not URL-safe base64" ;;
  esac
}

require_push_host_allowlist() {
  file="$1"
  key="$2"
  value=$(value_from "$file" "$key")

  printf '%s\n' "$value" |
    awk -F, '
      BEGIN { valid = 1 }
      NF < 1 || NF > 32 {
        valid = 0
        exit
      }
      {
        for (entry_index = 1; entry_index <= NF; entry_index += 1) {
          pattern = $entry_index
          wildcard = substr(pattern, 1, 2) == "*."
          hostname = wildcard ? substr(pattern, 3) : pattern

          if (pattern == "" || pattern != tolower(pattern)) valid = 0
          if (pattern ~ /[[:space:]]/) valid = 0
          if (index(pattern, "*") > 0 && !wildcard) valid = 0
          if (length(hostname) > 253 || seen[pattern]++) valid = 0
          if (!valid) {
            valid = 0
            exit
          }

          label_count = split(hostname, labels, ".")
          if (label_count < 2) {
            valid = 0
            exit
          }

          ipv4 = label_count == 4
          for (label_index = 1; label_index <= label_count; label_index += 1) {
            label = labels[label_index]
            if (length(label) < 1 || length(label) > 63) valid = 0
            if (label !~ /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/) {
              valid = 0
            }
            if (!valid) exit
            if (label !~ /^[0-9]+$/) ipv4 = 0
          }
          if (!valid || ipv4) {
            valid = 0
            exit
          }
        }
      }
      END { exit valid ? 0 : 1 }
    ' ||
    fail "$key must contain unique comma-separated lowercase host patterns"
}

case "$stage" in
  keys|full) ;;
  *) fail "usage: sh validate-self-hosted.sh [keys|full]" ;;
esac

for command in git docker openssl jq awk grep stat; do
  command -v "$command" >/dev/null 2>&1 ||
    fail "$command is required but not installed"
done

docker compose version >/dev/null 2>&1 ||
  fail "Docker Compose is unavailable"
docker info >/dev/null 2>&1 ||
  fail "the current user cannot reach the Docker daemon"

for file in \
  docker-compose.yml \
  run.sh \
  utils/generate-keys.sh \
  utils/add-new-auth-keys.sh \
  .env.example; do
  [ -f "$file" ] ||
    fail "$file is missing; run this from the Supabase project directory"
done

require_private_file .env

for key in \
  JWT_SECRET \
  ANON_KEY \
  SERVICE_ROLE_KEY \
  POSTGRES_PASSWORD \
  DASHBOARD_PASSWORD \
  SUPABASE_PUBLISHABLE_KEY \
  SUPABASE_SECRET_KEY \
  ANON_KEY_ASYMMETRIC \
  SERVICE_ROLE_KEY_ASYMMETRIC \
  JWT_KEYS \
  JWT_JWKS; do
  require_generated_value .env .env.example "$key"
done
require_jwt_value .env ANON_KEY_ASYMMETRIC
require_jwt_value .env SERVICE_ROLE_KEY_ASYMMETRIC
require_asymmetric_keyset .env

docker compose -f docker-compose.yml config --quiet >/dev/null 2>&1 ||
  fail "the base Docker Compose configuration is invalid"

if [ "$stage" = "keys" ]; then
  echo "Self-hosted Supabase key preflight passed."
  exit 0
fi

for command in crontab curl flock; do
  command -v "$command" >/dev/null 2>&1 ||
    fail "$command is required for the Organa schedulers but not installed"
done

supabase_url=$(value_from .env SUPABASE_PUBLIC_URL)
api_url=$(value_from .env API_EXTERNAL_URL)
site_url=$(value_from .env SITE_URL)
redirect_urls=$(value_from .env ADDITIONAL_REDIRECT_URLS)
oauth_callback="${api_url%/}/callback"

case "$supabase_url" in
  https://*) ;;
  *) fail "SUPABASE_PUBLIC_URL must use HTTPS for connected testing" ;;
esac
case "$api_url" in
  https://*/auth/v1) ;;
  *) fail "API_EXTERNAL_URL must use HTTPS and end with /auth/v1" ;;
esac
case "$site_url" in
  https://*) ;;
  *) fail "SITE_URL must use HTTPS for connected testing" ;;
esac
[ "$api_url" = "${supabase_url%/}/auth/v1" ] ||
  fail "API_EXTERNAL_URL must match SUPABASE_PUBLIC_URL plus /auth/v1"
case "$redirect_urls" in
  *"$site_url"*) ;;
  *) fail "ADDITIONAL_REDIRECT_URLS must include SITE_URL" ;;
esac
case "$redirect_urls" in
  *organa://*) ;;
  *) fail "ADDITIONAL_REDIRECT_URLS must include the organa:// callback" ;;
esac

[ "$(value_from .env FUNCTIONS_VERIFY_JWT)" = "false" ] ||
  fail "FUNCTIONS_VERIFY_JWT must be false for the scheduler-authenticated functions"
require_exact_value .env ENABLE_EMAIL_SIGNUP true
require_exact_value .env ENABLE_EMAIL_AUTOCONFIRM false
require_exact_value .env ENABLE_PHONE_SIGNUP false
for key in \
  SMTP_ADMIN_EMAIL \
  SMTP_HOST \
  SMTP_PORT \
  SMTP_USER \
  SMTP_PASS \
  SMTP_SENDER_NAME; do
  require_nonplaceholder_value .env .env.example "$key"
done

compose_files=$(value_from .env COMPOSE_FILE)
case ":$compose_files:" in
  *:docker-compose.organa.yml:*) ;;
  *) fail "docker-compose.organa.yml is not enabled in COMPOSE_FILE" ;;
esac

for file in \
  docker-compose.organa.yml \
  run-organa-schedulers.sh \
  volumes/templates/email-code.html \
  volumes/functions/finalize-account-deletions/index.ts \
  volumes/functions/dispatch-web-push/index.ts; do
  [ -f "$file" ] || fail "$file is missing"
done

require_private_file .env.auth
for provider in GOOGLE APPLE GITHUB; do
  require_exact_value \
    .env.auth \
    "GOTRUE_EXTERNAL_${provider}_ENABLED" \
    true
  require_configured_value \
    .env.auth \
    .env.auth.example \
    "GOTRUE_EXTERNAL_${provider}_CLIENT_ID"
  require_configured_value \
    .env.auth \
    .env.auth.example \
    "GOTRUE_EXTERNAL_${provider}_SECRET"
done

require_private_file .env.functions
for key in \
  ACCOUNT_DELETION_SCHEDULER_SECRET \
  WEB_PUSH_VAPID_PUBLIC_KEY \
  WEB_PUSH_VAPID_PRIVATE_KEY \
  WEB_PUSH_VAPID_SUBJECT \
  WEB_PUSH_ALLOWED_HOSTS \
  WEB_PUSH_SCHEDULER_SECRET; do
  require_generated_value .env.functions .env.functions.example "$key"
done

require_hex_secret .env.functions ACCOUNT_DELETION_SCHEDULER_SECRET
require_hex_secret .env.functions WEB_PUSH_SCHEDULER_SECRET
require_vapid_key .env.functions WEB_PUSH_VAPID_PUBLIC_KEY 87
require_vapid_key .env.functions WEB_PUSH_VAPID_PRIVATE_KEY 43
require_push_host_allowlist .env.functions WEB_PUSH_ALLOWED_HOSTS
vapid_subject=$(value_from .env.functions WEB_PUSH_VAPID_SUBJECT)
case "$vapid_subject" in
  mailto:*@*|https://*) ;;
  *) fail "WEB_PUSH_VAPID_SUBJECT must use mailto: or HTTPS" ;;
esac

docker compose config --quiet >/dev/null 2>&1 ||
  fail "the merged Docker Compose configuration is invalid"

docker compose config --format json |
  jq -e --arg callback "$oauth_callback" '
    .services as $services
    | $services.auth.environment as $auth
    | ($auth.GOTRUE_JWT_KEYS | fromjson) as $signing
    | ($services.rest.environment.PGRST_JWT_SECRET | fromjson) as $jwks
    | ($auth.GOTRUE_EXTERNAL_GOOGLE_ENABLED == "true")
      and ($auth.GOTRUE_EXTERNAL_APPLE_ENABLED == "true")
      and ($auth.GOTRUE_EXTERNAL_GITHUB_ENABLED == "true")
      and ($auth.GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI == $callback)
      and ($auth.GOTRUE_EXTERNAL_APPLE_REDIRECT_URI == $callback)
      and ($auth.GOTRUE_EXTERNAL_GITHUB_REDIRECT_URI == $callback)
      and ($auth.GOTRUE_MAILER_OTP_EXP == "900")
      and ($auth.GOTRUE_MAILER_OTP_LENGTH == "6")
      and ($auth.GOTRUE_MAILER_TEMPLATES_CONFIRMATION
        == "http://templates-server/email-code.html")
      and ($auth.GOTRUE_MAILER_TEMPLATES_MAGIC_LINK
        == "http://templates-server/email-code.html")
      and ($signing | type == "array" and length == 2)
      and ($jwks | type == "object" and (.keys | length == 2))
      and (($services.realtime.environment.API_JWT_JWKS | fromjson) == $jwks)
      and (($services.storage.environment.JWT_JWKS | fromjson) == $jwks)
      and (($services.functions.environment.SUPABASE_JWKS | fromjson) == $jwks)
      and ($signing | any(.[];
        .kty == "EC"
        and .alg == "ES256"
        and .crv == "P-256"
        and (.d | type == "string" and length > 0)))
      and ($jwks.keys | any(.[];
        .kty == "EC"
        and .alg == "ES256"
        and .crv == "P-256"
        and (has("d") | not)))
  ' >/dev/null 2>&1 ||
  fail "the resolved asymmetric Auth, provider, or email-code configuration is invalid"

services=$(docker compose config --services)
for service in auth rest realtime functions db templates-server; do
  printf '%s\n' "$services" | grep -q "^${service}$" ||
    fail "the resolved Compose model is missing the $service service"
done

echo "Self-hosted Supabase full preflight passed."
