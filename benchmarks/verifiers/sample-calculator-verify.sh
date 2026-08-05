#!/usr/bin/env bash
set -e

TARGET_DIR="${1:-/workspace}"
CALC_FILE="${TARGET_DIR}/src/calculator.ts"

if [ ! -f "$CALC_FILE" ]; then
  echo "Error: ${CALC_FILE} does not exist"
  exit 1
fi

if grep -q 'return a / b' "$CALC_FILE" || grep -q 'a / b' "$CALC_FILE"; then
  echo "Verification passed: Division function fixed successfully."
  exit 0
else
  echo "Verification failed: Division function still contains incorrect logic."
  exit 1
fi
