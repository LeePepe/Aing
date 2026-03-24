#!/bin/sh
AING_NOTIFY_SHIM_DIR="__BIN_DIR__"
export AING_NOTIFY_SHIM_DIR
exec "__NODE__" "__CLI__" run-agent --agent __AGENT__ -- "$@"
