#!/bin/bash
# Test runner wrapper
# Works around Node v25 localStorage issues

unset ELECTRON_RUN_AS_NODE
npx jest --verbose "$@"
