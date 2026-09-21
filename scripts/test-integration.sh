#!/usr/bin/env bash
set -euo pipefail

test_port="${TEST_PORT:-3010}"
test_base="http://127.0.0.1:${test_port}"
test_dir="$(mktemp -d)"
server_pid=""
mock_pid=""
venue_mock_pid=""

if [[ ! -d .next ]]; then
  echo "エラー: .next がありません。先に 'pnpm build' を実行してください。" >&2
  exit 1
fi

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
  fi
  if [[ -n "$mock_pid" ]]; then
    kill "$mock_pid" 2>/dev/null || true
  fi
  if [[ -n "$venue_mock_pid" ]]; then
    kill "$venue_mock_pid" 2>/dev/null || true
  fi
  rm -rf -- "$test_dir"
}
trap cleanup EXIT

export TURSO_DATABASE_URL="file:${test_dir}/test.db"
export TURSO_AUTH_TOKEN=""
export ENCOPA_CREATE_KEY="local-integration-test-only"
export ENCOPA_DATA_KEY="000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
export APP_ORIGIN="$test_base"
export TEST_BASE_URL="$test_base"
export TEST_CREATE_KEY="$ENCOPA_CREATE_KEY"
export HOTPEPPER_API_KEY="test-hotpepper-key"
export HOTPEPPER_BASE_URL="http://127.0.0.1:3012/gourmet/v1/"
export HOTPEPPER_ALLOW_INSECURE_LOCALHOST="true"
export TEST_HOTPEPPER_MOCK_URL="http://127.0.0.1:3012"
# Short enough that a test can watch the venue breaker close again without a long wait.
export ENCOPA_VENUE_BREAKER_COOLDOWN_MS="1500"
# Low enough that a test can reach the daily ceiling; production leaves it at the default.
export ENCOPA_VENUE_DAILY_LIMIT="12"
# The suite searches more often in a minute than a person would in an hour.
export ENCOPA_VENUE_IP_HOURLY_LIMIT="200"
export ORCAROUTER_API_KEY="test-orca-key"
export ORCAROUTER_BASE_URL="http://127.0.0.1:3011/v1"
export ORCAROUTER_ALLOW_INSECURE_LOCALHOST="true"
export TEST_MOCK_BASE_URL="http://127.0.0.1:3011"
# Short enough that a test can watch the breaker close again without a long wait.
export ENCOPA_AGENT_BREAKER_COOLDOWN_MS="1500"
export TEST_BREAKER_COOLDOWN_MS="1500"
# The suite makes more planning calls than a person would in an hour.
export ENCOPA_AGENT_IP_HOURLY_LIMIT="60"

node tests/orca-mock.mjs 3011 >"${test_dir}/orca-mock.log" 2>&1 &
mock_pid="$!"

node tests/hotpepper-mock.mjs 3012 >"${test_dir}/hotpepper-mock.log" 2>&1 &
venue_mock_pid="$!"

node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$test_port" >"${test_dir}/server.log" 2>&1 &
server_pid="$!"

for _ in $(seq 1 80); do
  if curl --silent --fail --output /dev/null "$test_base"; then
    # Serialized: the local SQLite file cannot take concurrent writers, and parallel test
    # files would make the routes degrade to their fallbacks on lock contention.
    # --experimental-strip-types lets a test import the app's own TypeScript modules
    # instead of a copy of them. Node 24 (.nvmrc) strips types without it; the flag is
    # still accepted there, so one command covers both versions.
    node --experimental-strip-types --test --test-concurrency=1 tests/*.test.mjs
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
