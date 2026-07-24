#!/bin/sh

set -eu

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

if [ "$#" -ne 1 ] || [ "$1" != "--fresh" ]; then
  fail "usage: sh initialize-official-supabase.sh --fresh"
fi

for command in git docker openssl jq awk grep stat mktemp; do
  command -v "$command" >/dev/null 2>&1 ||
    fail "$command is required but not installed"
done

docker compose version >/dev/null 2>&1 ||
  fail "Docker Compose is unavailable"
docker info >/dev/null 2>&1 ||
  fail "the current user cannot reach the Docker daemon"

for file in \
  .env.example \
  docker-compose.yml \
  run.sh \
  utils/generate-keys.sh \
  utils/add-new-auth-keys.sh \
  validate-self-hosted.sh; do
  [ -f "$file" ] ||
    fail "$file is missing; run this from the copied Supabase Docker directory"
done

if [ -e .env ] || [ -L .env ]; then
  fail ".env already exists; refusing to regenerate credentials for a possible existing instance"
fi

initializing=true
key_output_directory=""
cleanup_key_output() {
  if [ -n "$key_output_directory" ]; then
    rm -rf "$key_output_directory"
    key_output_directory=""
  fi
}

report_failure() {
  status=$?
  trap - 0 HUP INT TERM
  cleanup_key_output

  if [ "$status" -ne 0 ] && [ "$initializing" = "true" ] && [ -f .env ]; then
    chmod 600 .env 2>/dev/null || true
    echo \
      "Initialization stopped after .env was created. Do not rerun key generation blindly; inspect the first error above." \
      >&2
  fi

  exit "$status"
}
trap report_failure 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

umask 077
cp .env.example .env
chmod 600 .env

key_output_directory=$(
  mktemp -d "${TMPDIR:-/tmp}/organa-supabase-keys.XXXXXX"
)
chmod 700 "$key_output_directory"

run_key_generator() {
  output_file="$key_output_directory/output"
  : > "$output_file"
  chmod 600 "$output_file"

  if sh "$@" > "$output_file" 2>&1; then
    return 0
  else
    status=$?
  fi

  awk '
    /^(Error|ERROR|Warning):/ {
      print > "/dev/stderr"
      found = 1
    }
    END {
      if (!found) {
        print \
          "ERROR: key generation failed; credential-bearing output was withheld" \
          > "/dev/stderr"
      }
    }
  ' "$output_file"
  return "$status"
}

run_key_generator utils/generate-keys.sh --update-env
run_key_generator utils/add-new-auth-keys.sh --update-env
cleanup_key_output
chmod 600 .env

sh validate-self-hosted.sh keys

initializing=false
trap - 0 HUP INT TERM

echo "Fresh Supabase environment initialized and key preflight passed."
echo "Configure the public URLs, SMTP, OAuth, and Organa overrides before starting the stack."
