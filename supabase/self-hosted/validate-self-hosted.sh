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
  JWT_KEYS \
  JWT_JWKS; do
  require_generated_value .env .env.example "$key"
done

docker compose -f docker-compose.yml config --quiet >/dev/null 2>&1 ||
  fail "the base Docker Compose configuration is invalid"

if [ "$stage" = "keys" ]; then
  echo "Self-hosted Supabase key preflight passed."
  exit 0
fi

supabase_url=$(value_from .env SUPABASE_PUBLIC_URL)
api_url=$(value_from .env API_EXTERNAL_URL)
site_url=$(value_from .env SITE_URL)
redirect_urls=$(value_from .env ADDITIONAL_REDIRECT_URLS)

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

compose_files=$(value_from .env COMPOSE_FILE)
case ":$compose_files:" in
  *:docker-compose.organa.yml:*) ;;
  *) fail "docker-compose.organa.yml is not enabled in COMPOSE_FILE" ;;
esac

for file in \
  docker-compose.organa.yml \
  volumes/functions/finalize-account-deletions/index.ts \
  volumes/functions/dispatch-web-push/index.ts; do
  [ -f "$file" ] || fail "$file is missing"
done

require_private_file .env.functions
for key in \
  ACCOUNT_DELETION_SCHEDULER_SECRET \
  WEB_PUSH_VAPID_PUBLIC_KEY \
  WEB_PUSH_VAPID_PRIVATE_KEY \
  WEB_PUSH_VAPID_SUBJECT \
  WEB_PUSH_SCHEDULER_SECRET; do
  require_generated_value .env.functions .env.functions.example "$key"
done

docker compose config --quiet >/dev/null 2>&1 ||
  fail "the merged Docker Compose configuration is invalid"

services=$(docker compose config --services)
for service in auth rest realtime functions db; do
  printf '%s\n' "$services" | grep -q "^${service}$" ||
    fail "the resolved Compose model is missing the $service service"
done

echo "Self-hosted Supabase full preflight passed."
