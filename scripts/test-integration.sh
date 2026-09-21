#!/usr/bin/env bash
set -euo pipefail

test_port="${TEST_PORT:-3010}"
test_base="http://127.0.0.1:${test_port}"
test_dir="$(mktemp -d)"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
  fi
  rm -rf -- "$test_dir"
}
trap cleanup EXIT

export TURSO_DATABASE_URL="file:${test_dir}/test.db"
export TURSO_AUTH_TOKEN=""
export ENCOPA_CREATE_KEY="local-integration-test-only"
export APP_ORIGIN="$test_base"
export TEST_BASE_URL="$test_base"
export TEST_CREATE_KEY="$ENCOPA_CREATE_KEY"
export HOTPEPPER_API_KEY=""

node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$test_port" >"${test_dir}/server.log" 2>&1 &
server_pid="$!"

for _ in $(seq 1 80); do
  if curl --silent --fail --output /dev/null "$test_base"; then
    node --test tests/groups.test.mjs
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "${test_dir}/server.log"
    exit 1
  fi
  sleep 0.25
done

cat "${test_dir}/server.log"
exit 1
