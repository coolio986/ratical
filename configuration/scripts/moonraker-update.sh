#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "$(realpath -- "${BASH_SOURCE[0]}")" )" &> /dev/null && pwd )
# shellcheck source=./configuration/scripts/moonraker-ensure-policykit-rules.sh
source "$SCRIPT_DIR"/moonraker-ensure-policykit-rules.sh
ensure_moonraker_policiykit_rules

# shellcheck source=./configuration/scripts/ratical-common.sh
source "$SCRIPT_DIR"/ratical-common.sh
ensure_service_permission

echo "##### Symlinking registered extensions"
ratical extensions symlink klipper
