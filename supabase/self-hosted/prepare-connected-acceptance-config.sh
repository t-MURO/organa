#!/bin/sh

set -eu

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

usage() {
  fail "usage: sh prepare-connected-acceptance-config.sh --source-revision REVISION --migration-version VERSION --allow-synthetic-account-creation-and-deletion [--output PATH]"
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

source_revision=""
migration_version=""
output_path=".organa-connected-supabase.json"
consent=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source-revision)
      [ "$#" -ge 2 ] || usage
      source_revision="$2"
      shift 2
      ;;
    --migration-version)
      [ "$#" -ge 2 ] || usage
      migration_version="$2"
      shift 2
      ;;
    --output)
      [ "$#" -ge 2 ] || usage
      output_path="$2"
      shift 2
      ;;
    --allow-synthetic-account-creation-and-deletion)
      consent=true
      shift
      ;;
    *)
      usage
      ;;
  esac
done

[ "$consent" = "true" ] ||
  fail "explicit synthetic account creation and deletion consent is required"
printf '%s\n' "$source_revision" |
  grep -Eq '^[0-9a-f]{40}$' ||
  fail "the Supabase source revision must be 40 lowercase hexadecimal characters"
printf '%s\n' "$migration_version" |
  grep -Eq '^[0-9]{14}$' ||
  fail "the Organa migration version must be 14 digits"

for command in awk dirname grep jq mktemp stat tr; do
  command -v "$command" >/dev/null 2>&1 ||
    fail "$command is required but not installed"
done

[ -f .env ] && [ ! -L .env ] ||
  fail ".env must be a regular file; run this from the initialized Supabase Docker directory"
env_mode=$(
  stat -c '%a' .env 2>/dev/null ||
    stat -f '%Lp' .env 2>/dev/null ||
    true
)
case "$env_mode" in
  400|600) ;;
  *) fail ".env must have mode 600 or 400" ;;
esac

[ ! -e "$output_path" ] && [ ! -L "$output_path" ] ||
  fail "$output_path already exists; refusing to overwrite it"
case "$output_path" in
  ""|-*) fail "the output path is invalid" ;;
esac
output_directory=$(dirname "$output_path")
[ -d "$output_directory" ] ||
  fail "the output directory does not exist"

supabase_url=$(value_from .env SUPABASE_PUBLIC_URL)
publishable_key=$(value_from .env SUPABASE_PUBLISHABLE_KEY)
secret_key=$(value_from .env SUPABASE_SECRET_KEY)

case "$supabase_url" in
  https://*) ;;
  *) fail "SUPABASE_PUBLIC_URL must use HTTPS" ;;
esac
url_authority=${supabase_url#https://}
case "$url_authority" in
  ""|*/*|*\?*|*\#*|*@*)
    fail "SUPABASE_PUBLIC_URL must be an HTTPS origin without credentials, query, fragment, or path"
    ;;
esac
url_hostname=$(
  printf '%s\n' "${url_authority%%:*}" |
    tr '[:upper:]' '[:lower:]'
)
case "$url_hostname" in
  example.com|*.example.com|example.net|*.example.net|\
    example.org|*.example.org|*.example|*.invalid|*.test|\
    localhost|*.localhost)
    fail "SUPABASE_PUBLIC_URL still uses a placeholder or test hostname"
    ;;
esac
LC_ALL=C printf '%s\n' "$publishable_key" |
  grep -Eq '^sb_publishable_[!-~]{17,}$' ||
  fail "SUPABASE_PUBLISHABLE_KEY is missing or invalid"
LC_ALL=C printf '%s\n' "$secret_key" |
  grep -Eq '^sb_secret_[!-~]{17,}$' ||
  fail "SUPABASE_SECRET_KEY is missing or invalid"
printf '%s\n%s\n' "$publishable_key" "$secret_key" |
  grep -Eqi 'replace|example' &&
  fail "the connected keys still use placeholder values"
[ "$publishable_key" != "$secret_key" ] ||
  fail "the publishable and secret keys must be distinct"

umask 077
temporary_path=$(mktemp "${output_path}.tmp.XXXXXX")
cleanup() {
  status=$?
  trap - 0 HUP INT TERM
  rm -f "$temporary_path"
  exit "$status"
}
trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

jq -n \
  --arg source_revision "$source_revision" \
  --arg migration_version "$migration_version" \
  --arg supabase_url "$supabase_url" \
  --arg publishable_key "$publishable_key" \
  --arg secret_key "$secret_key" \
  '{
    purpose: "organa-controlled-beta-test",
    allowSyntheticAccountCreationAndDeletion: true,
    allowOneHourDeletionDrill: false,
    allowWebPushSchedulerDrill: false,
    deployment: {
      type: "self-hosted",
      sourceRevision: $source_revision,
      migrationVersion: $migration_version
    },
    supabaseUrl: $supabase_url,
    publishableKey: $publishable_key,
    secretKey: $secret_key
  }' > "$temporary_path"
chmod 600 "$temporary_path"
mv "$temporary_path" "$output_path"
trap - 0 HUP INT TERM

echo "Private connected-acceptance config written to $output_path with mode 600."
echo "Transfer it securely to the Organa repository root, then remove this extra server copy."
