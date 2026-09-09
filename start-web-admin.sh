#!/usr/bin/env bash

# Convenience launcher for Nexus Web Admin from the project root

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
exec "$DIR/web-admin/start-server.sh" "$@"
