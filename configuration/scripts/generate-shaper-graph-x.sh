#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "$(realpath -- "${BASH_SOURCE[0]}")" )" &> /dev/null && pwd )

# shellcheck source=./configuration/scripts/ratical-common.sh
source "$SCRIPT_DIR"/ratical-common.sh

NEWX=$(find /tmp -name "resonances_x_*.csv" -printf '%T@ %p\n' 2> /dev/null | sort -n | tail -1 | cut -f2- -d" ")
DATE=$(date +'%Y-%m-%d-%H%M%S')
 outdir="${RATICAL_PRINTER_DATA_DIR}"/config/input_shaper
if [ ! -d "${outdir}" ]
then
    mkdir "${outdir}"
    chown "${RATICAL_USERNAME}:${RATICAL_USERGROUP}" "${outdir}"
fi

# Use klippy-env: Kalico's calibrate_shaper imports klippy → needs cffi (not system python3)
"${KLIPPER_ENV}"/bin/python "${KLIPPER_DIR}"/scripts/calibrate_shaper.py "$NEWX" -o "${outdir}/resonances_x_${DATE}.png"
