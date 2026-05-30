#!/usr/bin/env bash
# Prevents deploy failure: .env env vars must not overlap Secret Manager names.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  echo "error: firebase/functions/.env must not exist when deploying." >&2
  echo "  Firebase loads .env as plain env vars and they clash with secrets." >&2
  echo "  Fix: mv firebase/functions/.env firebase/functions/.env.local" >&2
  echo "  (.env.local is for the emulator only and is not deployed.)" >&2
  exit 1
fi
