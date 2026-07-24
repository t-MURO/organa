#!/bin/sh

set -u

project_dir=$(
  CDPATH= cd -P "$(dirname "$0")" >/dev/null 2>&1 && pwd
)

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

invoke() {
  function_name="$1"
  scheduler_secret="$2"

  curl --config - <<EOF
url = "${supabase_url}/functions/v1/${function_name}"
request = "POST"
header = "Authorization: Bearer ${scheduler_secret}"
proto = "=https"
connect-timeout = 10
max-time = 50
fail
silent
show-error
output = "/dev/null"
EOF
}

require_scheduler_secret() {
  name="$1"
  value="$2"
  [ "${#value}" -eq 64 ] ||
    fail "$name must be a 64-character lowercase hexadecimal value"
  case "$value" in
    *[!0-9a-f]*) fail "$name must contain only lowercase hexadecimal characters" ;;
  esac
}

for command in awk curl flock; do
  command -v "$command" >/dev/null 2>&1 ||
    fail "$command is required but not installed"
done

env_file="$project_dir/.env"
function_env_file="$project_dir/.env.functions"
[ -f "$env_file" ] || fail "$env_file is missing"
[ -f "$function_env_file" ] || fail "$function_env_file is missing"

supabase_url=$(value_from "$env_file" SUPABASE_PUBLIC_URL)
deletion_secret=$(
  value_from "$function_env_file" ACCOUNT_DELETION_SCHEDULER_SECRET
)
web_push_secret=$(value_from "$function_env_file" WEB_PUSH_SCHEDULER_SECRET)

case "$supabase_url" in
  https://*) supabase_url="${supabase_url%/}" ;;
  *) fail "SUPABASE_PUBLIC_URL must use HTTPS" ;;
esac
supabase_origin="${supabase_url#https://}"
case "$supabase_origin" in
  ""|*/*|*\"*|*\\*|*" "*|*"	"*|*\?*|*\#*|*@*)
    fail "SUPABASE_PUBLIC_URL must be an HTTPS origin without credentials, path, query, or fragment"
    ;;
esac
require_scheduler_secret \
  ACCOUNT_DELETION_SCHEDULER_SECRET \
  "$deletion_secret"
require_scheduler_secret WEB_PUSH_SCHEDULER_SECRET "$web_push_secret"

lock_dir="${XDG_RUNTIME_DIR:-$project_dir}"
lock_file="$lock_dir/organa-schedulers.lock"
exec 9>"$lock_file"
flock -n 9 || exit 0

status=0
if ! invoke finalize-account-deletions "$deletion_secret"; then
  echo "ERROR: account-deletion scheduler request failed" >&2
  status=1
fi
if ! invoke dispatch-web-push "$web_push_secret"; then
  echo "ERROR: Web Push scheduler request failed" >&2
  status=1
fi

exit "$status"
