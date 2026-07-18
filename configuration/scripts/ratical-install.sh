#!/usr/bin/env bash
# This script installs additional dependencies for Ratical.

SCRIPT_DIR=$( cd -- "$( dirname -- "$(realpath -- "${BASH_SOURCE[0]}")" )" &> /dev/null && pwd )
CFG_DIR=$(realpath "$SCRIPT_DIR/..")

# shellcheck source=./configuration/scripts/ratical-common.sh
source "$SCRIPT_DIR"/ratical-common.sh

install_dependencies()
{
    report_status "Installing Ratical dependencies"
    # shellcheck disable=SC2086
    $SUDO apt-get update && $SUDO apt-get install -y $PKGLIST
}

install_printer_config()
{
    report_status "Copying printer configuration"
    PRINTER_CFG="${RATICAL_PRINTER_DATA_DIR}/config/printer.cfg"
    tail -n +2 "$CFG_DIR"/templates/initial-printer.template.cfg > "$PRINTER_CFG"
    # Ensure correct ownership if running as root
    if [ "$EUID" -eq 0 ]; then
        chown "${RATICAL_USERNAME}:${RATICAL_USERGROUP}" "$PRINTER_CFG"
    fi
}

install_udev_rules()
{
    report_status "Installing udev rules"
    $SUDO ln -sf "$CFG_DIR"/boards/*/*.rules /etc/udev/rules.d/
}

verify_ready()
{
    # Allow running as root for systemd-nspawn/container environments
    # When not root, we'll use sudo for privileged operations
    # When root, privileged operations run directly
    :
}

# Force script to exit if an error occurs
set -xe

verify_ready
install_printer_config
install_udev_rules
install_beacon
install_hooks
install_dependencies
ensure_pip_requirements
ensure_sudo_command_whitelisting
verify_registered_extensions
