#!/usr/bin/env bash
if [ ! "$EUID" -eq 0 ]; then
	echo "This script must run as root"
	exit 1
fi

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
# shellcheck source=./src/scripts/common.sh
source "$SCRIPT_DIR/common.sh"

printf "Running board script ${RATICAL_PRINTER_DATA_DIR}/config/Ratical/boards/%s\n\n" "$1"
"${RATICAL_PRINTER_DATA_DIR}/config/Ratical/boards/$1"
res=$?
chown -R "${RATICAL_USERNAME}":"${RATICAL_USERGROUP}" "${KLIPPER_DIR}"
exit $res
