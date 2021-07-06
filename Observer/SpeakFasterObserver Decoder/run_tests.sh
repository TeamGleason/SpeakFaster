#!/bin/bash
# Run all Python unit tests in this directory.

set -eu

for FILE_PATH in ./*_test.py; do
  echo "================================"
  echo "Running tests in ${FILE_PATH}..."
  python "${FILE_PATH}"
  echo
done
