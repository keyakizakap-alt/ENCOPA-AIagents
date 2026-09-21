#!/usr/bin/env bash
set -euo pipefail

test_port="${TEST_PORT:-3010}"
stub_port="${TEST_STUB_PORT:-3011}"
test_base="http://127.0.0.1:${test_port}"
stub_base="http://127.0.0.1:${stub_port}"
test_dir="$(mktemp -d)"
server_pid=""
stub_pid=""

if [[ ! -d .next ]]; then
  echo "エラー: .next がありません。先に 'pnpm build' を実行してください。" >&2
  exit 1
fi

cleanup() {
  for pid in "$server_pid" "$stub_pid"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  rm -rf -- "$test_dir"
}
trap cleanup EXIT

export TURSO_DATABASE_URL="file:${test_dir}/test.db"
export TURSO_AUTH_TOKEN=""
export ENCOPA_CREATE_KEY="local-integration-test-only"
export APP_ORIGIN="$test_base"
export TEST_BASE_URL="$test_base"
export TEST_CREATE_KEY="$ENCOPA_CREATE_KEY"
# The suite talks to a stub router (scripts/stub-orcarouter.mjs) instead of a real provider,
# so the retry, cache and prompt-cache paths are covered without network access or spend.
export ORCAROUTER_API_KEY="integration-test-key"
export ENCOPA_ORCA_URL="${stub_base}/v1/chat/completions"
export ENCOPA_AI_PROMPT_CACHE="1"
export TEST_STUB_BASE_URL="$stub_base"
export TEST_DB_URL="$TURSO_DATABASE_URL"

TEST_STUB_PORT="$stub_port" node scripts/stub-orcarouter.mjs >"${test_dir}/stub.log" 2>&1 &
stub_pid="$!"

node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$test_port" >"${test_dir}/server.log" 2>&1 &
server_pid="$!"

for _ in $(seq 1 80); do
  if curl --silent --fail --output /dev/null "$test_base"; then
    # Serialized: the local SQLite file cannot take concurrent writers, and parallel test
    # files would make the agent route degrade to its fallback on lock contention.
    node --test --test-concurrency=1 tests/*.test.mjs
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
